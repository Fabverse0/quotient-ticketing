import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import { createDatabase } from "../../src/shared/db/client.js";

const migrationsFolder = fileURLToPath(new URL("../../migrations", import.meta.url));

export async function startTestDatabase() {
  const container = await new PostgreSqlContainer("postgres:17").start();
  const databaseUrl = container.getConnectionUri();
  const database = createDatabase({ databaseUrl, dbPoolMax: 5 });
  await migrate(database.db, { migrationsFolder });

  return {
    ...database,
    databaseUrl,
    async stop() {
      await database.close();
      await container.stop();
    },
  };
}
