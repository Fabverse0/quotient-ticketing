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

// One statement: a CTE referenced more than once is materialized a single time.
export async function tallyActiveTicketsPerBuyer(tx: Executor, limit: number): Promise<BuyerTally> {
  const { rows } = await tx.execute<{ pairs: number; maxActiveQuantity: number; overLimit: BuyerTally["overLimit"] }>(sql`
    WITH active AS (
      SELECT buyer_id, event_id, SUM(quantity)::int AS quantity
      FROM orders WHERE status IN ('PENDING', 'PAID')
      GROUP BY buyer_id, event_id
    )
    SELECT
      (SELECT COUNT(*)::int FROM active) AS pairs,
      (SELECT COALESCE(MAX(quantity), 0)::int FROM active) AS "maxActiveQuantity",
      COALESCE(
        (SELECT json_agg(
            json_build_object('buyerId', buyer_id, 'eventId', event_id, 'activeQuantity', quantity)
            ORDER BY event_id, buyer_id)
         FROM active WHERE quantity > ${limit}),
        '[]'::json
      ) AS "overLimit"
  `);
  return rows[0]!;
}
