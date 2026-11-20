import type { Database } from "../../shared/db/client.js";
import { AppError } from "../../shared/errors.js";
import {
  findEventWithTypes,
  insertEvent,
  insertTicketTypes,
  listEventsByOrganizer,
  listEventsWithTypes,
  listPaidSales,
  listRecentOrdersForEvent,
  tallyOrdersByStatus,
} from "./queries.js";
import type { CreateEventInput } from "./schemas.js";
import { toOrganizerEvent, toPublicEvent } from "./views.js";

// A chart needs a shape, not every order; past this many paid orders the newest are kept.
const SALES_LIMIT = 2000;

export function createEventsService({ db }: { db: Database }) {
  return {
    // One transaction: an event never exists without both of its ticket types.
    async create(organizerId: string, input: CreateEventInput) {
      return db.transaction(async (tx) => {
        const event = await insertEvent(tx, organizerId, input);
        const types = await insertTicketTypes(tx, event.id, input.ticketTypes);
        return toOrganizerEvent(event, types);
      });
    },

    async list() {
      const rows = await listEventsWithTypes(db);
      return rows.map(({ event, types }) => toPublicEvent(event, types));
    },

    async getPublic(id: string) {
      const found = await findEventWithTypes(db, id);
      if (!found) {
        throw new AppError(404, "EVENT_NOT_FOUND", "Event tidak ditemukan");
      }
      return toPublicEvent(found.event, found.types);
    },

    async listForOrganizer(organizerId: string) {
      const rows = await listEventsByOrganizer(db, organizerId);
      return rows.map(({ event, types }) => toOrganizerEvent(event, types));
    },

    async recentOrders(id: string, organizerId: string, limit: number) {
      await this.getForOrganizer(id, organizerId);
      const rows = await listRecentOrdersForEvent(db, id, limit);
      return rows.map(({ kind, ...order }) => ({ ...order, ticketType: { kind } }));
    },

    async analytics(id: string, organizerId: string) {
      await this.getForOrganizer(id, organizerId);
      const [statuses, sales] = await Promise.all([tallyOrdersByStatus(db, id), listPaidSales(db, id, SALES_LIMIT)]);
      return { statuses, sales };
    },

    async getForOrganizer(id: string, organizerId: string) {
      const found = await findEventWithTypes(db, id);
      if (!found) {
        throw new AppError(404, "EVENT_NOT_FOUND", "Event tidak ditemukan");
      }
      if (found.event.organizerId !== organizerId) {
        throw new AppError(403, "FORBIDDEN", "Anda bukan pemilik event ini");
      }
      return toOrganizerEvent(found.event, found.types);
    },
  };
}

export type EventsService = ReturnType<typeof createEventsService>;
