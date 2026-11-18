import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import type { Config } from "../config.js";
import * as schema from "./schema.js";

export type Database = ReturnType<typeof createDatabase>["db"];

export function createDatabase(config: Pick<Config, "databaseUrl" | "dbPoolMax">) {
  const pool = new Pool({
    connectionString: config.databaseUrl,
    max: config.dbPoolMax,
  });

  // Without a listener, an error on an idle client crashes the process.
  pool.on("error", (err) => {
    console.error("Unexpected error on idle database client", err);
  });

  const db = drizzle({ client: pool, schema });
  return { db, pool, close: () => pool.end() };
}
