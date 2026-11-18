import { randomUUID } from "node:crypto";
import type { createApp } from "../../src/app.js";
import { seedOrganizer } from "../../src/modules/auth/seed.js";
import type { Database } from "../../src/shared/db/client.js";

type App = ReturnType<typeof createApp>;

export const TEST_JWT_SECRET = "a-test-secret-that-is-at-least-32-chars";
export const testAuthSettings = { secret: TEST_JWT_SECRET, expiresInSeconds: 3600 };

export function call(app: App, method: string, path: string, options: { token?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = {};
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  return app.request(path, {
    method,
    headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
}

export async function buyerToken(app: App, email = `buyer-${randomUUID()}@test.local`) {
  const res = await call(app, "POST", "/auth/register", {
    body: { email, password: "correct-horse", name: "Buyer" },
  });
  const body = await res.json();
  return { token: body.token as string, userId: body.user.id as string };
}

export async function organizerToken(db: Database, app: App, email = `org-${randomUUID()}@test.local`) {
  await seedOrganizer(db, { email, password: "organizer-pass" });
  const res = await call(app, "POST", "/auth/login", { body: { email, password: "organizer-pass" } });
  const body = await res.json();
  return { token: body.token as string, userId: body.user.id as string };
}
