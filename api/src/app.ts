import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { authRoutes } from "./modules/auth/handler.js";
import { createAuthService, type AuthSettings } from "./modules/auth/service.js";
import { eventRoutes, organizerEventRoutes } from "./modules/events/handler.js";
import { createEventsService } from "./modules/events/service.js";
import { orderRoutes } from "./modules/orders/handler.js";
import { createOrdersService } from "./modules/orders/service.js";
import { quotaStrategies } from "./modules/orders/strategy.js";
import { webhookRoutes } from "./modules/payments/handler.js";
import { createPaymentsService } from "./modules/payments/service.js";
import { ticketRoutes } from "./modules/tickets/handler.js";
import { createTicketsService } from "./modules/tickets/service.js";
import type { Clock } from "./shared/clock.js";
import type { QuotaStrategyName } from "./shared/config.js";
import type { Database } from "./shared/db/client.js";
import { AppError, registerErrorHandling } from "./shared/errors.js";

export interface AppDeps {
  db: Database;
  clock: Clock;
  auth: AuthSettings;
  quotaStrategy?: QuotaStrategyName;
  // Off unless asked for, so a missing flag can never expose it in production.
  simulatedPaymentEnabled?: boolean;
  // Without a secret the webhook route is not registered at all.
  paymentWebhookSecret?: string;
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

export function createApp({
  db,
  clock,
  auth,
  quotaStrategy = "atomic",
  simulatedPaymentEnabled = false,
  paymentWebhookSecret,
}: AppDeps) {
  const app = new Hono();

  app.route("/auth", authRoutes(createAuthService({ db, clock, settings: auth }), auth.secret));
  const eventsService = createEventsService({ db });
  app.route("/events", eventRoutes(eventsService, auth.secret));
  app.route("/organizer/events", organizerEventRoutes(eventsService, auth.secret));
  const ordersService = createOrdersService({ db, clock, strategy: quotaStrategies[quotaStrategy] });
  const paymentsService = createPaymentsService({ db, clock });
  app.route(
    "/orders",
    orderRoutes(ordersService, auth.secret, simulatedPaymentEnabled ? paymentsService : undefined),
  );
  app.route("/tickets", ticketRoutes(createTicketsService({ db }), auth.secret));
  if (paymentWebhookSecret) {
    app.route("/webhooks", webhookRoutes(paymentsService, paymentWebhookSecret));
  }

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
