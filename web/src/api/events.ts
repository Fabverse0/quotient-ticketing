import { api } from "./client";

export type TicketKind = "REGULAR" | "VIP";

export interface PublicTicketType {
  id: string;
  kind: TicketKind;
  price: number;
  quota: number;
  remaining: number;
}

export interface PublicEvent {
  id: string;
  title: string;
  description: string | null;
  venue: string;
  startsAt: string;
  ticketTypes: PublicTicketType[];
}

export const listEvents = () => api<PublicEvent[]>("/events");
export const getEvent = (id: string) => api<PublicEvent>(`/events/${id}`);

export const seatsLeft = (event: PublicEvent) => event.ticketTypes.reduce((sum, t) => sum + t.remaining, 0);
