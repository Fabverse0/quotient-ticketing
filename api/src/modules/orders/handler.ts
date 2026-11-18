import { Hono } from "hono";
import { parseJsonBody, parseParams } from "../../shared/validation.js";
import { requireAuth, requireRole, type AuthEnv } from "../auth/middleware.js";
import { createOrderSchema, idempotencyHeaderSchema, orderIdParamSchema } from "./schemas.js";
import type { OrdersService } from "./service.js";

export function orderRoutes(service: OrdersService, secret: string) {
  const routes = new Hono<AuthEnv>();

  routes.use("*", requireAuth(secret), requireRole("buyer"));

  routes.get("/", async (c) => c.json(await service.list(c.get("auth").userId)));

  routes.get("/:id", async (c) => {
    const { id } = parseParams(c, orderIdParamSchema);
    return c.json(await service.get(c.get("auth").userId, id));
  });

  routes.post("/", async (c) => {
    const input = await parseJsonBody(c, createOrderSchema);
    const headers = idempotencyHeaderSchema.parse({ "Idempotency-Key": c.req.header("Idempotency-Key") });
    const { order, replayed } = await service.create(c.get("auth").userId, input, headers["Idempotency-Key"]);
    return c.json(order, replayed ? 200 : 201);
  });

  routes.post("/:id/cancel", async (c) => {
    const { id } = parseParams(c, orderIdParamSchema);
    return c.json(await service.cancel(c.get("auth").userId, id));
  });

  return routes;
}
