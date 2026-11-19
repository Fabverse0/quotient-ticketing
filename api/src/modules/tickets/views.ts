import type { TicketRow } from "./queries.js";

export function toTicketView(ticket: TicketRow) {
  return { id: ticket.id, seq: ticket.seq, code: ticket.code, issuedAt: ticket.issuedAt };
}

export type TicketView = ReturnType<typeof toTicketView>;
