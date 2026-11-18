import type { Database } from "../../shared/db/client.js";
import { AppError } from "../../shared/errors.js";
import { findEventWithTypes, insertEvent, insertTicketTypes, listEventsWithTypes } from "./queries.js";
import type { CreateEventInput } from "./schemas.js";
import { toOrganizerEvent, toPublicEvent } from "./views.js";

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
  };
}

export type EventsService = ReturnType<typeof createEventsService>;
