import { sql } from "drizzle-orm";
import type { Executor } from "../../shared/db/client.js";

// A type alias, not an interface: tx.execute needs a Record-compatible row type.
export type TicketTypeTally = {
  eventId: string;
  ticketTypeId: string;
  kind: string;
  quota: number;
  sold: number;
  reserved: number;
  pendingQuantity: number;
  paidQuantity: number;
  tickets: number;
};

// Counters next to what the orders and tickets tables say they should be.
export async function tallyTicketTypes(tx: Executor): Promise<TicketTypeTally[]> {
  const { rows } = await tx.execute<TicketTypeTally>(sql`
    SELECT
      tt.event_id AS "eventId",
      tt.id AS "ticketTypeId",
      tt.kind,
      tt.quota,
      tt.sold,
      tt.reserved,
      COALESCE(o.pending, 0)::int AS "pendingQuantity",
      COALESCE(o.paid, 0)::int AS "paidQuantity",
      COALESCE(t.tickets, 0)::int AS tickets
    FROM ticket_types tt
    LEFT JOIN (
      SELECT ticket_type_id,
        SUM(quantity) FILTER (WHERE status = 'PENDING') AS pending,
        SUM(quantity) FILTER (WHERE status = 'PAID') AS paid
      FROM orders
      GROUP BY ticket_type_id
    ) o ON o.ticket_type_id = tt.id
    LEFT JOIN (
      SELECT o.ticket_type_id, COUNT(*) AS tickets
      FROM tickets t JOIN orders o ON o.id = t.order_id
      GROUP BY o.ticket_type_id
    ) t ON t.ticket_type_id = tt.id
    ORDER BY tt.event_id, tt.kind
  `);
  return rows;
}

export interface BuyerTally {
  pairs: number;
  maxActiveQuantity: number;
  overLimit: Array<{ buyerId: string; eventId: string; activeQuantity: number }>;
}

export async function tallyActiveTicketsPerBuyer(tx: Executor, limit: number): Promise<BuyerTally> {
  const active = sql`
    SELECT buyer_id, event_id, SUM(quantity)::int AS quantity
    FROM orders WHERE status IN ('PENDING', 'PAID')
    GROUP BY buyer_id, event_id
  `;
  const { rows: summary } = await tx.execute<{ pairs: number; maxActiveQuantity: number }>(sql`
    SELECT COUNT(*)::int AS pairs, COALESCE(MAX(quantity), 0)::int AS "maxActiveQuantity" FROM (${active}) a
  `);
  const { rows: overLimit } = await tx.execute<{ buyerId: string; eventId: string; activeQuantity: number }>(sql`
    SELECT buyer_id AS "buyerId", event_id AS "eventId", quantity AS "activeQuantity"
    FROM (${active}) a WHERE quantity > ${limit}
    ORDER BY event_id, buyer_id
  `);
  return { ...summary[0]!, overLimit };
}
