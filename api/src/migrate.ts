import { loadConfig } from "./shared/config.js";
import { createDatabase } from "./shared/db/client.js";
import { runMigrations } from "./shared/db/migrate.js";

const config = loadConfig();
const { db, close } = createDatabase(config);

try {
  await runMigrations(db);
  console.log("Migrations applied");
} catch (err) {
  console.error("Migration failed", err);
  process.exitCode = 1;
} finally {
  await close();
}
