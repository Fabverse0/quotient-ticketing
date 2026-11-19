import { sql, type SQL } from "drizzle-orm";
import type { Database } from "../../src/shared/db/client.js";

async function waitForLockWaiters(db: Database, count: number) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const { rows } = await db.execute<{ waiting: number }>(sql`
      SELECT count(*)::int AS waiting FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock'
    `);
    if (rows[0]!.waiting >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`expected ${count} backends waiting on a lock`);
}

// Every attempt blocks behind a holder of `lock`, then all race when it commits.
// Each attempt holds a pool connection: keep the count below pool size minus two.
export async function raceBehindLock<T>(
  db: Database,
  lock: SQL,
  attempts: Array<() => Promise<T>>,
): Promise<PromiseSettledResult<T>[]> {
  let signalLocked!: () => void;
  let release!: () => void;
  const locked = new Promise<void>((resolve) => (signalLocked = resolve));
  const released = new Promise<void>((resolve) => (release = resolve));

  const holder = db.transaction(async (tx) => {
    await tx.execute(lock);
    signalLocked();
    await released;
  });
  await locked;

  // Settled handlers are attached before anything can reject, so an attempt
  // that fails while the holder commits is never an unhandled rejection.
  const settled = Promise.allSettled(attempts.map((attempt) => attempt()));
  try {
    await waitForLockWaiters(db, attempts.length);
  } finally {
    release();
    await holder;
  }
  return settled;
}

export function fulfilledValues<T>(results: PromiseSettledResult<T>[]): T[] {
  return results.map((result) => {
    if (result.status === "rejected") throw result.reason;
    return result.value;
  });
}
