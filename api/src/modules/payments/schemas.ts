import { z } from "zod";

const PAYMENT_EVENT_TYPES = ["payment.succeeded", "payment.failed"] as const;

// Field names follow the provider's payload, not this API's camelCase.
const webhookEnvelopeSchema = z.object({
  event_id: z.string().min(1).max(255),
  event_type: z.string().min(1).max(255),
});

export const paymentWebhookSchema = webhookEnvelopeSchema.extend({
  event_type: z.enum(PAYMENT_EVENT_TYPES),
  order_id: z.uuid(),
  amount: z.number().int().min(0),
});

export type WebhookEnvelope = z.output<typeof webhookEnvelopeSchema>;
export type PaymentWebhook = z.output<typeof paymentWebhookSchema>;
export type ParsedWebhook = { payment: PaymentWebhook } | { ignored: WebhookEnvelope };

// Unknown types only need the envelope: a 400 would make the provider retry
// a type this API will never handle.
export function parseWebhook(payload: unknown): ParsedWebhook {
  const envelope = webhookEnvelopeSchema.parse(payload);
  return (PAYMENT_EVENT_TYPES as readonly string[]).includes(envelope.event_type)
    ? { payment: paymentWebhookSchema.parse(payload) }
    : { ignored: envelope };
}
