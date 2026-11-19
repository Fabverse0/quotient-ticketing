import { asc, eq } from "drizzle-orm";
import type { Executor } from "../../shared/db/client.js";
import { tickets } from "../../shared/db/schema.js";

export type TicketRow = typeof tickets.$inferSelect;

export async function insertTickets(
  tx: Executor,
  orderId: string,
  codes: string[],
  issuedAt: Date,
): Promise<TicketRow[]> {
  const rows = await tx
    .insert(tickets)
    .values(codes.map((code, index) => ({ orderId, seq: index + 1, code, issuedAt })))
    .returning();
  return rows.sort((a, b) => a.seq - b.seq);
}

export async function findTicketsForOrder(db: Executor, orderId: string): Promise<TicketRow[]> {
  return db.select().from(tickets).where(eq(tickets.orderId, orderId)).orderBy(asc(tickets.seq));
}
