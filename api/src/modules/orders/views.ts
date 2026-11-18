import type { OrderWithContext } from "./queries.js";

export function toOrderView({ order, eventTitle, eventStartsAt, ticketKind }: OrderWithContext) {
  return {
    id: order.id,
    status: order.status,
    quantity: order.quantity,
    totalPrice: order.totalPrice,
    createdAt: order.createdAt,
    expiresAt: order.expiresAt,
    paidAt: order.paidAt,
    cancelledAt: order.cancelledAt,
    expiredAt: order.expiredAt,
    refundRequiredAt: order.refundRequiredAt,
    event: { id: order.eventId, title: eventTitle, startsAt: eventStartsAt },
    ticketType: { id: order.ticketTypeId, kind: ticketKind },
  };
}

export type OrderView = ReturnType<typeof toOrderView>;
