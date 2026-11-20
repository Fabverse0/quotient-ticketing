import { Hono } from "hono";
import { z } from "zod";
import { requireAuth, requireRole, type AuthEnv } from "../auth/middleware.js";
import type { InvariantsService } from "./service.js";

const scopeSchema = z.object({ eventId: z.uuid().optional() });

// Without eventId the check covers every event; with it, only that event and only for its owner.
// Always 200: a violation is data about the system, not a failed request.
export function invariantRoutes(service: InvariantsService, secret: string) {
  const routes = new Hono<AuthEnv>();

  routes.use("*", requireAuth(secret), requireRole("organizer"));

  routes.get("/", async (c) => {
    const { eventId } = scopeSchema.parse(c.req.query());
    return c.json(eventId ? await service.checkEvent(eventId, c.get("auth").userId) : await service.check());
  });

  return routes;
}
