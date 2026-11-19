import type { BuyerTicketRow, TicketRow } from "./queries.js";

export function toTicketView(ticket: TicketRow) {
  return { id: ticket.id, seq: ticket.seq, code: ticket.code, issuedAt: ticket.issuedAt };
}

export type TicketView = ReturnType<typeof toTicketView>;

export function toBuyerTicketView({ ticket, event, ticketType }: BuyerTicketRow) {
  return { ...toTicketView(ticket), orderId: ticket.orderId, event, ticketType };
}
