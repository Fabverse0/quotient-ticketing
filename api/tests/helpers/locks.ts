import { sql, type SQL } from "drizzle-orm";
import type { Database } from "../../src/shared/db/client.js";

export async function waitForLockWaiters(db: Database, count: number) {
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

// Holds `lock` in an open transaction until release(), for staging interleavings
// one step at a time.
export async function holdLock(db: Database, lock: SQL): Promise<{ release(): Promise<void> }> {
  let signalLocked!: () => void;
  let release!: () => void;
  const locked = new Promise<void>((resolve) => (signalLocked = resolve));
  const released = new Promise<void>((resolve) => (release = resolve));

  const holder = db.transaction(async (tx) => {
    await tx.execute(lock);
    signalLocked();
    await released;
  });
  await Promise.race([locked, holder]);
  return {
    async release() {
      release();
      await holder;
    },
  };
}

// Every attempt blocks behind a holder of `lock`, then all race when it commits.
// Each attempt holds a pool connection: keep the count below pool size minus two.
export async function raceBehindLock<T>(
  db: Database,
  lock: SQL,
  attempts: Array<() => Promise<T>>,
): Promise<PromiseSettledResult<T>[]> {
  const held = await holdLock(db, lock);
  // Settled handlers are attached before anything can reject, so an attempt
  // that fails while the holder commits is never an unhandled rejection.
  const settled = Promise.allSettled(attempts.map((attempt) => attempt()));
  try {
    await waitForLockWaiters(db, attempts.length);
  } finally {
    await held.release();
  }
  return settled;
}

const WHILE_BLOCKED_TIMEOUT_MS = 2000;

// Starts each blocked step only after the previous ones wait on a lock, so the
// order in which they took their row locks is fixed. whileBlocked must finish
// without waiting; a step that blocks there fails after a timeout.
export async function stageBehindLock<T = undefined>(
  db: Database,
  lock: SQL,
  blocked: Array<() => Promise<unknown>>,
  whileBlocked?: () => Promise<T>,
): Promise<{ blocked: PromiseSettledResult<unknown>[]; during: T | undefined }> {
  const held = await holdLock(db, lock);
  const started: Promise<unknown>[] = [];
  let during: T | undefined;
  try {
    for (const step of blocked) {
      const running = step();
      running.catch(() => {});
      started.push(running);
      await waitForLockWaiters(db, started.length);
    }
    if (whileBlocked) {
      let timer: NodeJS.Timeout | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("whileBlocked step was blocked")), WHILE_BLOCKED_TIMEOUT_MS);
      });
      try {
        during = await Promise.race([whileBlocked(), timeout]);
      } finally {
        clearTimeout(timer);
      }
    }
  } finally {
    await held.release();
  }
  return { blocked: await Promise.allSettled(started), during };
}

export function fulfilledValues<T>(results: PromiseSettledResult<T>[]): T[] {
  return results.map((result) => {
    if (result.status === "rejected") throw result.reason;
    return result.value;
  });
}
