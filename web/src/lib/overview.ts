import type { OrganizerEvent } from "../api/organizer";
import type { TicketKind } from "../api/events";

export interface Totals {
  quota: number;
  sold: number;
  reserved: number;
  revenue: number;
}

export interface Overview extends Totals {
  remaining: number;
  byKind: Record<TicketKind, Totals>;
}

const empty = (): Totals => ({ quota: 0, sold: 0, reserved: 0, revenue: 0 });

// Everything on the overview comes from the per-type counters the API already sends.
// `sold` counts PAID seats and a ticket type has one price, so sold x price is the revenue.
export function summarize(events: OrganizerEvent[]): Overview {
  const byKind: Record<TicketKind, Totals> = { REGULAR: empty(), VIP: empty() };
  for (const event of events) {
    for (const type of event.ticketTypes) {
      const totals = byKind[type.kind];
      totals.quota += type.quota;
      totals.sold += type.sold;
      totals.reserved += type.reserved;
      totals.revenue += type.sold * type.price;
    }
  }
  const all = Object.values(byKind);
  const sum = (pick: (t: Totals) => number) => all.reduce((n, t) => n + pick(t), 0);
  const quota = sum((t) => t.quota);
  const sold = sum((t) => t.sold);
  const reserved = sum((t) => t.reserved);
  return { quota, sold, reserved, revenue: sum((t) => t.revenue), remaining: quota - sold - reserved, byKind };
}
