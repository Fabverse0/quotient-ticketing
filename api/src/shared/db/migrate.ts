import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import type { Database } from "./client.js";

// Resolves to api/migrations from src/ and to /app/migrations from dist/.
export const defaultMigrationsFolder = fileURLToPath(new URL("../../../migrations", import.meta.url));

export async function runMigrations(db: Database, migrationsFolder = defaultMigrationsFolder) {
  await migrate(db, { migrationsFolder });
}
