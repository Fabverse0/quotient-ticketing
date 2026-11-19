import { Hono } from "hono";
import { requireAuth, requireRole, type AuthEnv } from "../auth/middleware.js";
import type { TicketsService } from "./service.js";

export function ticketRoutes(service: TicketsService, secret: string) {
  const routes = new Hono<AuthEnv>();

  routes.use("*", requireAuth(secret), requireRole("buyer"));

  routes.get("/", async (c) => c.json(await service.list(c.get("auth").userId)));

  return routes;
}
