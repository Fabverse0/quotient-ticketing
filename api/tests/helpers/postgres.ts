import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { inject } from "vitest";
import { createDatabase } from "../../src/shared/db/client.js";
import { runMigrations } from "../../src/shared/db/migrate.js";
import { RUN_LABEL } from "./global-setup.js";

export async function startTestDatabase() {
  const container = await new PostgreSqlContainer("postgres:17").withLabels({ [RUN_LABEL]: inject("testRunId") }).start();
  const databaseUrl = container.getConnectionUri();
  const database = createDatabase({ databaseUrl, dbPoolMax: 5 });
  try {
    await runMigrations(database.db);
  } catch (err) {
    await database.close();
    await container.stop();
    throw err;
  }

  return {
    ...database,
    databaseUrl,
    async stop() {
      await database.close();
      await container.stop();
    },
  };
}
