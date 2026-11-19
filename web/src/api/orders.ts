import { api } from "./client";
import type { TicketKind } from "./events";

export type OrderStatus = "PENDING" | "PAID" | "CANCELLED" | "EXPIRED" | "REFUND_REQUIRED";

export interface Order {
  id: string;
  status: OrderStatus;
  quantity: number;
  totalPrice: number;
  createdAt: string;
  expiresAt: string;
  paidAt: string | null;
  cancelledAt: string | null;
  expiredAt: string | null;
  refundRequiredAt: string | null;
  event: { id: string; title: string; startsAt: string };
  ticketType: { id: string; kind: TicketKind };
}

export interface OrderTicket {
  id: string;
  seq: number;
  code: string;
  issuedAt: string;
}

export interface OrderDetail extends Order {
  tickets: OrderTicket[];
}

export interface BuyerTicket extends OrderTicket {
  orderId: string;
  event: { id: string; title: string; venue: string; startsAt: string };
  ticketType: { id: string; kind: TicketKind };
}

// The same key is sent again only when retrying an attempt whose answer was lost.
export const placeOrder = (body: { ticketTypeId: string; quantity: number }, idempotencyKey: string) =>
  api<Order>("/orders", { method: "POST", body, headers: { "Idempotency-Key": idempotencyKey } });

export const listOrders = () => api<Order[]>("/orders");
export const getOrder = (id: string) => api<OrderDetail>(`/orders/${id}`);
export const payOrder = (id: string) => api<OrderDetail>(`/orders/${id}/pay`, { method: "POST" });
export const cancelOrder = (id: string) => api<Order>(`/orders/${id}/cancel`, { method: "POST" });
export const listTickets = () => api<BuyerTicket[]>("/tickets");
