import type { OrganizerEvent } from "../api/organizer";

// The list arrives soonest first. Analytics opens on the next event that has not
// started, or on the latest one when every event is behind us.
export function defaultEvent(events: OrganizerEvent[], now: number): OrganizerEvent | undefined {
  return events.find((e) => new Date(e.startsAt).getTime() > now) ?? events.at(-1);
}
