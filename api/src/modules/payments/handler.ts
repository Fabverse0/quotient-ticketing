import { Hono } from "hono";
import { AppError } from "../../shared/errors.js";
import { paymentWebhookSchema } from "./schemas.js";
import type { PaymentsService } from "./service.js";
import { verifySignature } from "./signature.js";

// No JWT: the provider proves itself with an HMAC of the raw body.
export function webhookRoutes(service: PaymentsService, secret: string) {
  const routes = new Hono();

  routes.post("/payment", async (c) => {
    const rawBody = Buffer.from(await c.req.arrayBuffer());
    if (!verifySignature(rawBody, c.req.header("X-Signature"), secret)) {
      throw new AppError(401, "INVALID_SIGNATURE", "Signature webhook tidak valid");
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody.toString("utf8"));
    } catch {
      throw new AppError(400, "INVALID_JSON", "Body request harus berupa JSON yang valid");
    }
    const event = paymentWebhookSchema.parse(payload);
    return c.json(await service.handleWebhook(event, payload));
  });

  return routes;
}
