import { AppError } from "../../shared/errors.js";

const CAPACITY_CONSTRAINT = "ticket_types_capacity";

// Drizzle wraps the pg error; the constraint name lives on `cause`.
function violatedConstraint(err: unknown): string | undefined {
  if (!(err instanceof Error)) return undefined;
  const cause = err.cause as { constraint?: unknown } | undefined;
  return typeof cause?.constraint === "string" ? cause.constraint : undefined;
}

// Exhaustion is normally reported by the atomic update. The CHECK firing means
// an oversell reached the database: same 409 for the client, logged as a bug.
export async function withCapacityGuard<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (err) {
    if (violatedConstraint(err) === CAPACITY_CONSTRAINT) {
      console.error("capacity guard triggered", err);
      throw new AppError(409, "QUOTA_EXHAUSTED", "Kuota tiket tidak mencukupi");
    }
    throw err;
  }
}
