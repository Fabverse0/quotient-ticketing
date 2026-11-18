import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { authRoutes } from "./modules/auth/handler.js";
import { createAuthService, type AuthSettings } from "./modules/auth/service.js";
import { eventRoutes, organizerEventRoutes } from "./modules/events/handler.js";
import { createEventsService } from "./modules/events/service.js";
import type { Clock } from "./shared/clock.js";
import type { Database } from "./shared/db/client.js";
import { AppError, registerErrorHandling } from "./shared/errors.js";

export interface AppDeps {
  db: Database;
  clock: Clock;
  auth: AuthSettings;
}

const HEALTH_DB_TIMEOUT_MS = 2000;

async function pingDatabase(db: Database): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("database ping timed out")), HEALTH_DB_TIMEOUT_MS);
  });
  try {
    await Promise.race([db.execute(sql`select 1`), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export function createApp({ db, clock, auth }: AppDeps) {
  const app = new Hono();

  app.route("/auth", authRoutes(createAuthService({ db, clock, settings: auth }), auth.secret));
  const eventsService = createEventsService({ db });
  app.route("/events", eventRoutes(eventsService, auth.secret));
  app.route("/organizer/events", organizerEventRoutes(eventsService, auth.secret));

  app.get("/health", async (c) => {
    try {
      await pingDatabase(db);
    } catch (err) {
      console.error("Health check failed", err);
      throw new AppError(503, "DATABASE_UNAVAILABLE", "Database tidak dapat dijangkau");
    }
    return c.json({ status: "ok", database: "up", time: clock.now().toISOString() });
  });

  registerErrorHandling(app);
  return app;
}
