import { z } from "zod";

// Field names follow the provider's payload, not this API's camelCase.
export const paymentWebhookSchema = z.object({
  event_id: z.string().min(1).max(255),
  event_type: z.enum(["payment.succeeded", "payment.failed"]),
  order_id: z.uuid(),
  amount: z.number().int().min(0),
});

export type PaymentWebhook = z.output<typeof paymentWebhookSchema>;
