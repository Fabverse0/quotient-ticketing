import { loadConfig } from "./shared/config.js";
import { createDatabase } from "./shared/db/client.js";
import { runMigrations } from "./shared/db/migrate.js";

const config = loadConfig();
// No lock_timeout: a migration waiting behind another replica's migration or a
// long transaction must wait, not fail and keep the API from starting.
const { db, close } = createDatabase({ ...config, dbLockTimeoutMs: 0 });

try {
  await runMigrations(db);
  console.log("Migrations applied");
} catch (err) {
  console.error("Migration failed", err);
  process.exitCode = 1;
} finally {
  await close();
}
