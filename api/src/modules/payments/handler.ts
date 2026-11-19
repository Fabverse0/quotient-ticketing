import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { AppError } from "../../shared/errors.js";
import { paymentWebhookSchema } from "./schemas.js";
import type { PaymentsService } from "./service.js";
import { verifySignature } from "./signature.js";

// The route is unauthenticated until the HMAC check, so the body is capped
// before it is buffered. Real provider events are a few hundred bytes.
const MAX_WEBHOOK_BODY_BYTES = 64 * 1024;

// No JWT: the provider proves itself with an HMAC of the raw body.
export function webhookRoutes(service: PaymentsService, secret: string) {
  const routes = new Hono();

  const limit = bodyLimit({
    maxSize: MAX_WEBHOOK_BODY_BYTES,
    onError: () => {
      throw new AppError(413, "PAYLOAD_TOO_LARGE", "Body webhook melebihi 64 KB");
    },
  });

  routes.post("/payment", limit, async (c) => {
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
