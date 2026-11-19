import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { AppError } from "../../shared/errors.js";
import { parseWebhook } from "./schemas.js";
import type { PaymentsService } from "./service.js";
import { verifySignature } from "./signature.js";

// Unauthenticated until the HMAC check, so the body is capped before buffering.
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
    return c.json(await service.handleWebhook(parseWebhook(payload), payload));
  });

  return routes;
}
