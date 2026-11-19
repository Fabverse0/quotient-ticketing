import { asc, desc, eq } from "drizzle-orm";
import type { Executor } from "../../shared/db/client.js";
import { events, orders, tickets, ticketTypes } from "../../shared/db/schema.js";

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

export interface BuyerTicketRow {
  ticket: TicketRow;
  event: { id: string; title: string; venue: string; startsAt: Date };
  ticketType: { id: string; kind: (typeof ticketTypes.$inferSelect)["kind"] };
}

export async function listTicketsForBuyer(db: Executor, buyerId: string): Promise<BuyerTicketRow[]> {
  return db
    .select({
      ticket: tickets,
      event: { id: events.id, title: events.title, venue: events.venue, startsAt: events.startsAt },
      ticketType: { id: ticketTypes.id, kind: ticketTypes.kind },
    })
    .from(tickets)
    .innerJoin(orders, eq(orders.id, tickets.orderId))
    .innerJoin(events, eq(events.id, orders.eventId))
    .innerJoin(ticketTypes, eq(ticketTypes.id, orders.ticketTypeId))
    .where(eq(orders.buyerId, buyerId))
    .orderBy(desc(tickets.issuedAt), asc(tickets.orderId), asc(tickets.seq));
}
