import { Hono } from "hono";
import { requireAuth, requireRole, type AuthEnv } from "../auth/middleware.js";
import { parseJsonBody } from "../../shared/validation.js";
import { createEventSchema } from "./schemas.js";
import type { EventsService } from "./service.js";

export function eventRoutes(service: EventsService, secret: string) {
  const routes = new Hono<AuthEnv>();

  routes.post("/", requireAuth(secret), requireRole("organizer"), async (c) => {
    const input = await parseJsonBody(c, createEventSchema);
    return c.json(await service.create(c.get("auth").userId, input), 201);
  });

  return routes;
}
