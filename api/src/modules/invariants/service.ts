import type { Database } from "../../shared/db/client.js";
import { tallyActiveTicketsPerBuyer, tallyTicketTypes, type TicketTypeTally } from "./queries.js";

const BUYER_TICKET_LIMIT = 4;

export interface InvariantViolation {
  subject: Record<string, string>;
  values: Record<string, number>;
}

export interface InvariantCheck {
  id: string;
  description: string;
  ok: boolean;
  checked: number;
  // Totals over every row checked, so an OK line still shows what was compared.
  values: Record<string, number>;
  violations: InvariantViolation[];
}

export interface InvariantReport {
  ok: boolean;
  checks: InvariantCheck[];
}

interface TicketTypeRule {
  id: string;
  description: string;
  compare: (row: TicketTypeTally) => Record<string, number>;
  holds: (left: number, right: number) => boolean;
}

const equal = (left: number, right: number) => left === right;
const atMost = (left: number, right: number) => left <= right;

const TICKET_TYPE_RULES: TicketTypeRule[] = [
  {
    id: "reserved_matches_pending",
    description: "reserved = jumlah quantity pesanan PENDING",
    compare: (r) => ({ reserved: r.reserved, pendingQuantity: r.pendingQuantity }),
    holds: equal,
  },
  {
    id: "sold_matches_paid",
    description: "sold = jumlah quantity pesanan PAID",
    compare: (r) => ({ sold: r.sold, paidQuantity: r.paidQuantity }),
    holds: equal,
  },
  {
    id: "tickets_match_sold",
    description: "jumlah tiket = sold",
    compare: (r) => ({ tickets: r.tickets, sold: r.sold }),
    holds: equal,
  },
  {
    id: "counters_within_quota",
    description: "sold + reserved <= quota",
    compare: (r) => ({ soldPlusReserved: r.sold + r.reserved, quota: r.quota }),
    holds: atMost,
  },
  // The naive lost update keeps the counters valid; only the orders show the oversell.
  {
    id: "orders_within_quota",
    description: "jumlah quantity pesanan PENDING + PAID <= quota",
    compare: (r) => ({ activeQuantity: r.pendingQuantity + r.paidQuantity, quota: r.quota }),
    holds: atMost,
  },
];

function applyRule(rule: TicketTypeRule, rows: TicketTypeTally[]): InvariantCheck {
  const values: Record<string, number> = {};
  const violations: InvariantViolation[] = [];
  for (const row of rows) {
    const compared = rule.compare(row);
    for (const [key, value] of Object.entries(compared)) values[key] = (values[key] ?? 0) + value;
    const [left, right] = Object.values(compared) as [number, number];
    if (!rule.holds(left, right)) {
      violations.push({
        subject: { eventId: row.eventId, ticketTypeId: row.ticketTypeId, kind: row.kind },
        values: compared,
      });
    }
  }
  return {
    id: rule.id,
    description: rule.description,
    ok: violations.length === 0,
    checked: rows.length,
    values,
    violations,
  };
}

export function createInvariantsService({ db }: { db: Database }) {
  return {
    // One read-only snapshot, so a write committing mid-check cannot show up in
    // one tally and not the next as a false violation.
    async check(): Promise<InvariantReport> {
      const { rows, buyers } = await db.transaction(
        async (tx) => ({
          rows: await tallyTicketTypes(tx),
          buyers: await tallyActiveTicketsPerBuyer(tx, BUYER_TICKET_LIMIT),
        }),
        { isolationLevel: "repeatable read", accessMode: "read only" },
      );

      const checks = TICKET_TYPE_RULES.map((rule) => applyRule(rule, rows));
      checks.push({
        id: "buyer_limit",
        description: `tidak ada pembeli dengan lebih dari ${BUYER_TICKET_LIMIT} tiket aktif per event`,
        ok: buyers.overLimit.length === 0,
        checked: buyers.pairs,
        values: { maxActiveQuantity: buyers.maxActiveQuantity, limit: BUYER_TICKET_LIMIT },
        violations: buyers.overLimit.map(({ buyerId, eventId, activeQuantity }) => ({
          subject: { buyerId, eventId },
          values: { activeQuantity, limit: BUYER_TICKET_LIMIT },
        })),
      });
      return { ok: checks.every((c) => c.ok), checks };
    },
  };
}

export type InvariantsService = ReturnType<typeof createInvariantsService>;
