import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { DEFAULT_DB_TIMEOUT_MS, type Config } from "../config.js";
import * as schema from "./schema.js";

export type Database = ReturnType<typeof createDatabase>["db"];
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type Executor = Database | Transaction;

// Kills a transaction left open by a crashed or stuck caller, so it cannot hold
// the hot ticket_types row lock forever.
const IDLE_IN_TRANSACTION_TIMEOUT_MS = 10_000;

type DatabaseConfig = Pick<Config, "databaseUrl" | "dbPoolMax"> &
  Partial<Pick<Config, "dbConnectionTimeoutMs" | "dbLockTimeoutMs">>;

// Both timeouts fail a request instead of letting it hang: waiting for a free
// pooled connection, and waiting on a row or advisory lock.
export function createDatabase(config: DatabaseConfig) {
  const pool = new Pool({
    connectionString: config.databaseUrl,
    max: config.dbPoolMax,
    connectionTimeoutMillis: config.dbConnectionTimeoutMs ?? DEFAULT_DB_TIMEOUT_MS,
    lock_timeout: config.dbLockTimeoutMs ?? DEFAULT_DB_TIMEOUT_MS,
    idle_in_transaction_session_timeout: IDLE_IN_TRANSACTION_TIMEOUT_MS,
  });

  // Without a listener, an error on an idle client crashes the process.
  pool.on("error", (err) => {
    console.error("Unexpected error on idle database client", err);
  });

  const db = drizzle({ client: pool, schema });
  return { db, pool, close: () => pool.end() };
}
