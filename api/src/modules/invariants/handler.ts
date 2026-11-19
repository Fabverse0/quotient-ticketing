import { Hono } from "hono";
import { requireAuth, requireRole, type AuthEnv } from "../auth/middleware.js";
import type { InvariantsService } from "./service.js";

// Always 200: a violation is data about the system, not a failed request.
export function invariantRoutes(service: InvariantsService, secret: string) {
  const routes = new Hono<AuthEnv>();

  routes.use("*", requireAuth(secret), requireRole("organizer"));

  routes.get("/", async (c) => c.json(await service.check()));

  return routes;
}
