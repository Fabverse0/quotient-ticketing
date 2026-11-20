import { asc, eq } from "drizzle-orm";
import type { Executor } from "../shared/db/client.js";
import { ticketTypes } from "../shared/db/schema.js";

export function readCounters(db: Executor, eventId: string) {
  return db
    .select({ id: ticketTypes.id, quota: ticketTypes.quota, sold: ticketTypes.sold, reserved: ticketTypes.reserved })
    .from(ticketTypes)
    .where(eq(ticketTypes.eventId, eventId))
    .orderBy(asc(ticketTypes.kind));
}
