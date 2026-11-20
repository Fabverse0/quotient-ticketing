import { Client } from "pg";

export const QUOTA_CHANNEL = "quota_changed";
// Names the connection in pg_stat_activity.
export const LISTENER_APPLICATION_NAME = "quotient-realtime";

const MAX_RETRY_MS = 10_000;

interface ListenerOptions {
  connectionString: string;
  onNotify: (eventId: string) => void;
  onStatus: (listening: boolean) => void;
  retryMs: number;
}

// A dedicated client outside the pool: a pooled connection would be handed to
// queries and its LISTEN would end up on whichever request borrows it next.
// The hub also reads counters on it, so a push never queues behind a pool full
// of order requests (a 200-order burst would otherwise hold it back to the end).
export function listenForQuotaChanges({ connectionString, onNotify, onStatus, retryMs }: ListenerOptions) {
  let client: Client | undefined;
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  let delay = retryMs;

  const retry = () => {
    if (stopped) return;
    timer = setTimeout(() => void connect(), delay);
    delay = Math.min(delay * 2, MAX_RETRY_MS);
  };

  async function connect() {
    const next = new Client({
      connectionString,
      application_name: LISTENER_APPLICATION_NAME,
      keepAlive: true,
      connectionTimeoutMillis: 5000,
    });
    next.on("notification", (msg) => {
      if (msg.channel === QUOTA_CHANNEL && msg.payload) onNotify(msg.payload);
    });
    next.on("error", (err) => console.error("LISTEN connection error:", err.message));
    next.on("end", () => {
      if (client !== next) return;
      client = undefined;
      onStatus(false);
      retry();
    });

    try {
      await next.connect();
      await next.query(`LISTEN ${QUOTA_CHANNEL}`);
    } catch (err) {
      console.error("LISTEN connection failed:", (err as Error).message);
      void next.end().catch(() => {});
      retry();
      return;
    }
    if (stopped) {
      await next.end();
      return;
    }
    client = next;
    delay = retryMs;
    onStatus(true);
  }

  return {
    // Undefined while disconnected; open streams are closed then anyway.
    get client() {
      return client;
    },
    // Settles after the first attempt, whether it connected or scheduled a retry.
    ready: connect(),
    async stop() {
      stopped = true;
      clearTimeout(timer);
      const current = client;
      client = undefined;
      await current?.end();
    },
  };
}
