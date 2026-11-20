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

function openStream(c: Context, subscribe: (client: StreamClient) => () => void) {
  return streamSSE(c, async (stream) => {
    let finish!: () => void;
    const finished = new Promise<void>((resolve) => (finish = resolve));
    // Subscribed before the first await, so no change slips in between the
    // response headers (the browser's "open") and the subscription.
    const unsubscribe = subscribe({
      send: (event, data) => void stream.writeSSE({ event, data: JSON.stringify(data) }),
      ping: () => void stream.write(": ping\n\n"),
      close: finish,
    });
    stream.onAbort(finish);
    try {
      await stream.write(`retry: ${RETRY_MS}\n\n`);
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
    return openStream(c, (client) => hub.subscribePublic(client));
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
    return openStream(c, (client) => hub.subscribeOrganizer(id, client));
  });

  return routes;
}
