import { Hono } from "hono";
import { parseJsonBody } from "../../shared/validation.js";
import { requireAuth, requireRole, type AuthEnv } from "../auth/middleware.js";
import { createOrderSchema } from "./schemas.js";
import type { OrdersService } from "./service.js";

export function orderRoutes(service: OrdersService, secret: string) {
  const routes = new Hono<AuthEnv>();

  routes.use("*", requireAuth(secret), requireRole("buyer"));

  routes.post("/", async (c) => {
    const input = await parseJsonBody(c, createOrderSchema);
    return c.json(await service.create(c.get("auth").userId, input), 201);
  });

  return routes;
}
