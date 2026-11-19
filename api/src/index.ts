import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { startSweeper, sweepExpiredOrders } from "./jobs/sweeper.js";
import { seedOrganizer } from "./modules/auth/seed.js";
import { systemClock } from "./shared/clock.js";
import { loadConfig } from "./shared/config.js";
import { createDatabase } from "./shared/db/client.js";

const config = loadConfig();
const { db, close } = createDatabase(config);
if (config.organizer) {
  const result = await seedOrganizer(db, config.organizer);
  console.log(`Organizer account ${config.organizer.email}: ${result}`);
}

const app = createApp({
  db,
  clock: systemClock,
  auth: { secret: config.jwtSecret, expiresInSeconds: config.jwtExpiresInSeconds },
  quotaStrategy: config.quotaStrategy,
  naiveRaceDelayMs: config.naiveRaceDelayMs,
  simulatedPaymentEnabled: config.simulatedPaymentEnabled,
  paymentWebhookSecret: config.paymentWebhookSecret,
});
if (config.quotaStrategy === "naive") {
  console.warn("QUOTA_STRATEGY=naive: quota reservation is deliberately unsafe and can oversell");
}

// Every instance runs its own sweeper; SKIP LOCKED keeps them from colliding.
const sweeper = config.sweeper.enabled
  ? startSweeper(() => sweepExpiredOrders(db, systemClock.now()), config.sweeper.intervalMs)
  : undefined;

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`Quotient API listening on port ${info.port} (${config.nodeEnv})`);
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down`);
  // Before server.close, which can wait a long time on open connections.
  await sweeper?.stop();
  server.close(async (err) => {
    await close();
    process.exit(err ? 1 : 0);
  });
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
