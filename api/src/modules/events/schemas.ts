import { z } from "zod";
import { ticketKind } from "../../shared/db/schema.js";

// Caps keep price * 4 (max tickets per order) inside a Postgres integer.
export const MAX_PRICE = 100_000_000;
export const MAX_QUOTA = 1_000_000;

const ticketTypeInput = z.object({
  kind: z.enum(ticketKind.enumValues),
  price: z.number().int().min(0).max(MAX_PRICE),
  quota: z.number().int().min(0).max(MAX_QUOTA),
});

export const createEventSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).default(""),
  venue: z.string().trim().min(1).max(200),
  startsAt: z.iso.datetime({ offset: true }).transform((value) => new Date(value)),
  ticketTypes: z
    .array(ticketTypeInput)
    .length(2, "harus berisi tepat 2 tipe tiket: REGULAR dan VIP")
    .refine((types) => new Set(types.map((t) => t.kind)).size === 2, "harus berisi satu REGULAR dan satu VIP"),
});

export type CreateEventInput = z.output<typeof createEventSchema>;

export const eventIdParamSchema = z.object({ id: z.uuid() });

export const recentOrdersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
