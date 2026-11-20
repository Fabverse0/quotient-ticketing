import { api } from "./client";
import type { OrderStatus } from "./orders";
import type { TicketKind } from "./events";

export interface OrganizerTicketType {
  id: string;
  kind: TicketKind;
  price: number;
  quota: number;
  sold: number;
  reserved: number;
  remaining: number;
}

export interface OrganizerEvent {
  id: string;
  title: string;
  description: string | null;
  venue: string;
  startsAt: string;
  ticketTypes: OrganizerTicketType[];
}

export interface RecentOrder {
  id: string;
  status: OrderStatus;
  quantity: number;
  totalPrice: number;
  createdAt: string;
  expiresAt: string;
  buyerName: string;
  ticketType: { kind: TicketKind };
}

export interface InvariantViolation {
  subject: Record<string, string>;
  values: Record<string, number>;
}

export interface InvariantCheck {
  id: string;
  description: string;
  ok: boolean;
  checked: number;
  values: Record<string, number>;
  violations: InvariantViolation[];
}

export interface InvariantReport {
  ok: boolean;
  checks: InvariantCheck[];
}

export interface NewEvent {
  title: string;
  description: string;
  venue: string;
  startsAt: string;
  ticketTypes: Array<{ kind: TicketKind; price: number; quota: number }>;
}

export const listMyEvents = () => api<OrganizerEvent[]>("/organizer/events");
export const getMyEvent = (id: string) => api<OrganizerEvent>(`/organizer/events/${id}`);
export const recentOrders = (id: string) => api<RecentOrder[]>(`/organizer/events/${id}/orders?limit=20`);
export const createEvent = (body: NewEvent) => api<OrganizerEvent>("/events", { method: "POST", body });
export const streamTicket = (id: string) =>
  api<{ ticket: string }>(`/organizer/events/${id}/stream-ticket`, { method: "POST" });
export const checkInvariants = (eventId: string) => api<InvariantReport>(`/admin/invariants?eventId=${eventId}`);
