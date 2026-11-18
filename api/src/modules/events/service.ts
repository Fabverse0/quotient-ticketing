import type { Database } from "../../shared/db/client.js";
import { insertEvent, insertTicketTypes } from "./queries.js";
import type { CreateEventInput } from "./schemas.js";
import { toOrganizerEvent } from "./views.js";

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
  };
}

export type EventsService = ReturnType<typeof createEventsService>;
