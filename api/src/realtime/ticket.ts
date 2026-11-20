import { sign, verify } from "hono/jwt";
import { z } from "zod";

export const STREAM_TICKET_TTL_SECONDS = 60;

// No `role` claim, so a ticket never passes as a login token, and `scope` keeps
// a login token from passing as a ticket.
const ticketSchema = z.object({
  user_id: z.uuid(),
  event_id: z.uuid(),
  scope: z.literal("stream"),
  exp: z.number(),
});

export interface StreamTicket {
  userId: string;
  eventId: string;
}

export function issueStreamTicket({ userId, eventId }: StreamTicket, { secret, now }: { secret: string; now: Date }) {
  const iat = Math.floor(now.getTime() / 1000);
  return sign(
    { user_id: userId, event_id: eventId, scope: "stream", iat, exp: iat + STREAM_TICKET_TTL_SECONDS },
    secret,
    "HS256",
  );
}

export async function verifyStreamTicket(token: string, secret: string): Promise<StreamTicket | null> {
  try {
    const payload = ticketSchema.safeParse(await verify(token, secret, "HS256"));
    return payload.success ? { userId: payload.data.user_id, eventId: payload.data.event_id } : null;
  } catch {
    return null;
  }
}
