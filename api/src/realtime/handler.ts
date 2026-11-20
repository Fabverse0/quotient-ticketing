import type { HttpBindings } from "@hono/node-server";
import { Hono, type Context } from "hono";
import { streamSSE } from "hono/streaming";
import { requireAuth, requireRole, type AuthEnv } from "../modules/auth/middleware.js";
import { eventIdParamSchema } from "../modules/events/schemas.js";
import type { EventsService } from "../modules/events/service.js";
import type { Clock } from "../shared/clock.js";
import { AppError } from "../shared/errors.js";
import { parseParams } from "../shared/validation.js";
import type { RealtimeHub, StreamClient } from "./hub.js";
import { issueStreamTicket, verifyStreamTicket } from "./ticket.js";

const RETRY_MS = 3000;

function openStream(c: Context, maxBufferedBytes: number, subscribe: (client: StreamClient) => () => void) {
  return streamSSE(c, async (stream) => {
    let finish!: () => void;
    const finished = new Promise<void>((resolve) => (finish = resolve));

    // node-server stops reading the body while the socket is full, so a write
    // that has not resolved yet is data the client has not taken.
    let unsent = 0;
    const write = (text: string) => {
      if (stream.aborted) return;
      const size = Buffer.byteLength(text);
      unsent += size;
      if (unsent > maxBufferedBytes) {
        console.warn(`SSE client fell ${unsent} bytes behind, disconnecting`);
        // The server waits for a drain that may never come; only the socket going away frees it.
        (c.env as Partial<HttpBindings> | undefined)?.incoming?.socket.destroy();
        stream.abort();
        return;
      }
      void stream.write(text).then(() => {
        unsent -= size;
      });
    };

    // Subscribed before the first await, so no change slips in between the
    // response headers (the browser's "open") and the subscription.
    const unsubscribe = subscribe({
      // JSON.stringify never emits a raw newline, so the data fits on one SSE line.
      send: (event, data) => write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
      ping: () => write(": ping\n\n"),
      close: finish,
    });
    stream.onAbort(finish);
    try {
      write(`retry: ${RETRY_MS}\n\n`);
      await finished;
    } finally {
      unsubscribe();
    }
  });
}

interface Deps {
  hub: RealtimeHub;
  events: EventsService;
  secret: string;
  clock: Clock;
}

export function realtimeRoutes({ hub, events, secret, clock }: Deps) {
  const routes = new Hono<AuthEnv>();

  routes.get("/events/stream", (c) => {
    hub.assertAccepting();
    return openStream(c, hub.maxBufferedBytes, (client) => hub.subscribePublic(client));
  });

  // EventSource cannot send an Authorization header, so the login token is
  // traded for a short ticket that is safe to put in the URL.
  routes.post("/organizer/events/:id/stream-ticket", requireAuth(secret), requireRole("organizer"), async (c) => {
    const { id } = parseParams(c, eventIdParamSchema);
    const { userId } = c.get("auth");
    await events.getForOrganizer(id, userId);
    return c.json({ ticket: await issueStreamTicket({ userId, eventId: id }, { secret, now: clock.now() }) });
  });

  // The ticket is checked once, when the stream opens; a reconnect needs a new one.
  routes.get("/organizer/events/:id/stream", async (c) => {
    const { id } = parseParams(c, eventIdParamSchema);
    const token = c.req.query("ticket");
    if (!token) {
      throw new AppError(401, "UNAUTHORIZED", "Tiket stream diperlukan");
    }
    const ticket = await verifyStreamTicket(token, secret);
    if (!ticket || ticket.eventId !== id) {
      throw new AppError(401, "INVALID_TOKEN", "Tiket stream tidak valid atau sudah kedaluwarsa");
    }
    await events.getForOrganizer(id, ticket.userId);
    hub.assertAccepting();
    return openStream(c, hub.maxBufferedBytes, (client) => hub.subscribeOrganizer(id, client));
  });

  return routes;
}
