import { z } from "zod";

export const MAX_TICKETS_PER_BUYER_PER_EVENT = 4;
export const ORDER_HOLD_MS = 15 * 60 * 1000;

export const createOrderSchema = z.object({
  ticketTypeId: z.uuid(),
  quantity: z.number().int().min(1).max(MAX_TICKETS_PER_BUYER_PER_EVENT),
});

export type CreateOrderInput = z.output<typeof createOrderSchema>;

export const idempotencyHeaderSchema = z.object({
  "Idempotency-Key": z.string().min(1).max(255).optional(),
});

export const orderIdParamSchema = z.object({ id: z.uuid() });
