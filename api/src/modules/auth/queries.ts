import { eq } from "drizzle-orm";
import type { Database } from "../../shared/db/client.js";
import { users } from "../../shared/db/schema.js";

export type UserRow = typeof users.$inferSelect;

export async function findUserByEmail(db: Database, email: string): Promise<UserRow | undefined> {
  const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return row;
}

// ON CONFLICT keeps duplicate detection atomic: two concurrent registrations
// for the same email cannot both succeed, and neither surfaces a raw pg error.
export async function insertUserIfNew(
  db: Database,
  user: Pick<typeof users.$inferInsert, "email" | "passwordHash" | "name" | "role">,
): Promise<UserRow | undefined> {
  const [row] = await db.insert(users).values(user).onConflictDoNothing({ target: users.email }).returning();
  return row;
}
