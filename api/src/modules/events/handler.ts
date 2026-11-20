import { Hono } from "hono";
import { parseJsonBody, parseParams } from "../../shared/validation.js";
import { requireAuth, requireRole, type AuthEnv } from "../auth/middleware.js";
import { createEventSchema, eventIdParamSchema, recentOrdersQuerySchema } from "./schemas.js";
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

export function organizerEventRoutes(service: EventsService, secret: string) {
  const routes = new Hono<AuthEnv>();

  routes.use("*", requireAuth(secret), requireRole("organizer"));

  routes.get("/", async (c) => c.json(await service.listForOrganizer(c.get("auth").userId)));

  routes.get("/:id", async (c) => {
    const { id } = parseParams(c, eventIdParamSchema);
    return c.json(await service.getForOrganizer(id, c.get("auth").userId));
  });

  routes.get("/:id/orders", async (c) => {
    const { id } = parseParams(c, eventIdParamSchema);
    const { limit } = recentOrdersQuerySchema.parse(c.req.query());
    return c.json(await service.recentOrders(id, c.get("auth").userId, limit));
  });

  return routes;
}
