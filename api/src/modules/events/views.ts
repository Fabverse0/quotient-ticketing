import { ticketKind } from "../../shared/db/schema.js";
import type { EventRow, TicketTypeRow } from "./queries.js";

const KIND_ORDER = new Map<string, number>(ticketKind.enumValues.map((kind, index) => [kind, index]));

export const remaining = (t: Pick<TicketTypeRow, "quota" | "sold" | "reserved">) => t.quota - t.sold - t.reserved;

const byKind = (a: TicketTypeRow, b: TicketTypeRow) => (KIND_ORDER.get(a.kind) ?? 0) - (KIND_ORDER.get(b.kind) ?? 0);

export function toOrganizerEvent(event: EventRow, types: TicketTypeRow[]) {
  return {
    id: event.id,
    organizerId: event.organizerId,
    title: event.title,
    description: event.description,
    venue: event.venue,
    startsAt: event.startsAt,
    createdAt: event.createdAt,
    ticketTypes: [...types].sort(byKind).map((t) => ({
      id: t.id,
      kind: t.kind,
      price: t.price,
      quota: t.quota,
      sold: t.sold,
      reserved: t.reserved,
      remaining: remaining(t),
    })),
  };
}
