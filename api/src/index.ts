import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
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
});
if (config.quotaStrategy === "naive") {
  console.warn("QUOTA_STRATEGY=naive: quota reservation is deliberately unsafe and can oversell");
}

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`Quotient API listening on port ${info.port} (${config.nodeEnv})`);
});

let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down`);
  server.close(async (err) => {
    await close();
    process.exit(err ? 1 : 0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
