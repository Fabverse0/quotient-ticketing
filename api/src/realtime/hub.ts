import { remaining } from "../modules/events/views.js";
import { AppError } from "../shared/errors.js";
import { listenForQuotaChanges } from "./listener.js";
import { readCounters, type CounterRow } from "./queries.js";

export interface StreamClient {
  send(event: string, data: unknown): void;
  ping(): void;
  close(): void;
}

interface HubOptions {
  connectionString: string;
  coalesceMs?: number;
  heartbeatMs?: number;
  listenRetryMs?: number;
  // Unsent bytes a stream may pile up before the client is dropped as too slow.
  maxBufferedBytes?: number;
}

export function createRealtimeHub({
  connectionString,
  coalesceMs = 400,
  heartbeatMs = 15_000,
  listenRetryMs = 1000,
  maxBufferedBytes = 64 * 1024,
}: HubOptions) {
  const publicClients = new Set<StreamClient>();
  const watchers = new Map<string, Set<StreamClient>>();
  const pending = new Map<string, NodeJS.Timeout>();
  let listening = false;
  let listener: ReturnType<typeof listenForQuotaChanges> | undefined;
  let heartbeat: NodeJS.Timeout | undefined;

  const everyone = () => [...publicClients, ...[...watchers.values()].flatMap((set) => [...set])];

  function closeAll() {
    for (const client of everyone()) client.close();
    publicClients.clear();
    watchers.clear();
  }

  async function flush(eventId: string) {
    const connection = listener?.client;
    if (!connection || (publicClients.size === 0 && !watchers.get(eventId)?.size)) return;

    let types: CounterRow[];
    try {
      types = await readCounters(connection, eventId);
    } catch (err) {
      console.error("Realtime: reading counters failed", err);
      return;
    }
    if (types.length === 0) return;

    const publicMessage = { eventId, ticketTypes: types.map((t) => ({ id: t.id, remaining: remaining(t) })) };
    for (const client of publicClients) client.send("quota", publicMessage);

    // Looked up after the read: the set may have been replaced while it ran.
    const owners = watchers.get(eventId);
    if (owners?.size) {
      const organizerMessage = { eventId, ticketTypes: types.map((t) => ({ ...t, remaining: remaining(t) })) };
      for (const client of owners) {
        client.send("quota", organizerMessage);
        client.send("orders", { eventId });
      }
    }
  }

  // Trailing window: the first change opens it, later ones ride along, and the
  // counters are read once when it closes.
  function schedule(eventId: string) {
    if (pending.has(eventId)) return;
    pending.set(
      eventId,
      setTimeout(() => {
        pending.delete(eventId);
        void flush(eventId);
      }, coalesceMs),
    );
  }

  return {
    get listening() {
      return listening;
    },

    maxBufferedBytes,

    async start() {
      heartbeat = setInterval(() => {
        for (const client of everyone()) client.ping();
      }, heartbeatMs);
      listener = listenForQuotaChanges({
        connectionString,
        retryMs: listenRetryMs,
        onNotify: schedule,
        onStatus: (up) => {
          listening = up;
          // Changes made while LISTEN is down are lost, so streams that stay open
          // would show stale numbers. Closed, the browser reconnects and reloads.
          if (!up) closeAll();
        },
      });
      await listener.ready;
    },

    async stop() {
      clearInterval(heartbeat);
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
      closeAll();
      listening = false;
      await listener?.stop();
    },

    assertAccepting() {
      if (!listening) {
        throw new AppError(503, "DATABASE_UNAVAILABLE", "Pembaruan langsung sedang tidak tersedia");
      }
    },

    subscribePublic(client: StreamClient) {
      publicClients.add(client);
      return () => void publicClients.delete(client);
    },

    subscribeOrganizer(eventId: string, client: StreamClient) {
      const set = watchers.get(eventId) ?? new Set<StreamClient>();
      set.add(client);
      watchers.set(eventId, set);
      return () => {
        set.delete(client);
        if (set.size === 0 && watchers.get(eventId) === set) watchers.delete(eventId);
      };
    },
  };
}

export type RealtimeHub = ReturnType<typeof createRealtimeHub>;
