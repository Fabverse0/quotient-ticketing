import { Hono } from "hono";
import { parseJsonBody, parseParams } from "../../shared/validation.js";
import { requireAuth, requireRole, type AuthEnv } from "../auth/middleware.js";
import { createEventSchema, eventIdParamSchema } from "./schemas.js";
import type { EventsService } from "./service.js";

export function eventRoutes(service: EventsService, secret: string) {
  const routes = new Hono<AuthEnv>();

  routes.get("/", async (c) => c.json(await service.list()));

  routes.get("/:id", async (c) => {
    const { id } = parseParams(c, eventIdParamSchema);
    return c.json(await service.getPublic(id));
  });

  routes.post("/", requireAuth(secret), requireRole("organizer"), async (c) => {
    const input = await parseJsonBody(c, createEventSchema);
    return c.json(await service.create(c.get("auth").userId, input), 201);
  });

  return routes;
}
