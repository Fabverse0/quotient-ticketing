import { api } from "./client";

export interface PublicEvent {
  id: string;
  title: string;
  description: string | null;
  venue: string;
  startsAt: string;
  ticketTypes: Array<{ id: string; kind: "REGULAR" | "VIP"; price: number; remaining: number }>;
}

export const listEvents = () => api<PublicEvent[]>("/events");
