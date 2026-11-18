import { Hono } from "hono";
import { z } from "zod";
import { parseJsonBody } from "../../shared/validation.js";
import { requireAuth, type AuthEnv } from "./middleware.js";
import type { AuthService } from "./service.js";

// bcrypt only reads the first 72 bytes, so longer passwords would be silently truncated.
const password = z
  .string()
  .refine((value) => Buffer.byteLength(value) <= 72, "maksimal 72 byte");

const registerSchema = z.object({
  email: z.email(),
  password: password.pipe(z.string().min(8, "minimal 8 karakter")),
  name: z.string().trim().min(1).max(100),
});

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export function authRoutes(service: AuthService, secret: string) {
  const routes = new Hono<AuthEnv>();

  routes.post("/register", async (c) => {
    const input = await parseJsonBody(c, registerSchema);
    return c.json(await service.registerBuyer(input), 201);
  });

  routes.post("/login", async (c) => {
    const input = await parseJsonBody(c, loginSchema);
    return c.json(await service.login(input), 200);
  });

  routes.get("/me", requireAuth(secret), async (c) => {
    return c.json(await service.getProfile(c.get("auth").userId));
  });

  return routes;
}
