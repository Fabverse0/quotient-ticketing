import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { createDatabase } from "../../src/shared/db/client.js";
import { runMigrations } from "../../src/shared/db/migrate.js";

export async function startTestDatabase() {
  const container = await new PostgreSqlContainer("postgres:17").start();
  const databaseUrl = container.getConnectionUri();
  const database = createDatabase({ databaseUrl, dbPoolMax: 5 });
  await runMigrations(database.db);

  return {
    ...database,
    databaseUrl,
    async stop() {
      await database.close();
      await container.stop();
    },
  };
}
