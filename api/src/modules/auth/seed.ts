import type { Database } from "../../shared/db/client.js";
import { hashPassword } from "./password.js";
import { findUserByEmail, insertUserIfNew } from "./queries.js";

export type SeedResult = "created" | "exists";

function assertOrganizer(email: string, role: string) {
  if (role !== "organizer") {
    throw new Error(`Cannot seed organizer: ${email} already belongs to a ${role}`);
  }
}

// Safe to run on every start and from several replicas at once. An existing
// account is left alone, including its password.
export async function seedOrganizer(
  db: Database,
  account: { email: string; password: string },
): Promise<SeedResult> {
  const existing = await findUserByEmail(db, account.email);
  if (existing) {
    assertOrganizer(account.email, existing.role);
    return "exists";
  }

  const created = await insertUserIfNew(db, {
    email: account.email,
    name: "Organizer",
    passwordHash: await hashPassword(account.password),
    role: "organizer",
  });
  if (created) {
    return "created";
  }

  // Another seeder inserted the same email between our check and our insert.
  const winner = await findUserByEmail(db, account.email);
  assertOrganizer(account.email, winner?.role ?? "missing");
  return "exists";
}
