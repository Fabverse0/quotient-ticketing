import { Hono } from "hono";
import { parseJsonBody } from "../../shared/validation.js";
import { requireAuth, requireRole, type AuthEnv } from "../auth/middleware.js";
import { createOrderSchema, idempotencyHeaderSchema } from "./schemas.js";
import type { OrdersService } from "./service.js";

export function orderRoutes(service: OrdersService, secret: string) {
  const routes = new Hono<AuthEnv>();

  routes.use("*", requireAuth(secret), requireRole("buyer"));

  routes.post("/", async (c) => {
    const input = await parseJsonBody(c, createOrderSchema);
    const headers = idempotencyHeaderSchema.parse({ "Idempotency-Key": c.req.header("Idempotency-Key") });
    const { order, replayed } = await service.create(c.get("auth").userId, input, headers["Idempotency-Key"]);
    return c.json(order, replayed ? 200 : 201);
  });

  return routes;
}
