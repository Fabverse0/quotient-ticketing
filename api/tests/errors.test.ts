import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AppError, registerErrorHandling } from "../src/shared/errors.js";

function buildApp() {
  const app = new Hono();
  app.get("/app-error", () => {
    throw new AppError(409, "QUOTA_EXHAUSTED", "Kuota habis");
  });
  app.get("/zod", () => {
    z.object({ quantity: z.number().int().min(1).max(4), kind: z.enum(["REGULAR", "VIP"]) }).parse({
      quantity: 9,
      kind: "GOLD",
    });
    return new Response("unreachable");
  });
  app.get("/http-exception", () => {
    throw new HTTPException(401, { message: "Token tidak valid" });
  });
  app.get("/boom", () => {
    throw new Error("connection string postgres://secret@db leaked");
  });
  registerErrorHandling(app);
  return app;
}

describe("global error handling", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps AppError to its status and code", async () => {
    const res = await buildApp().request("/app-error");
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: { code: "QUOTA_EXHAUSTED", message: "Kuota habis" },
    });
  });

  it("maps ZodError to 400 VALIDATION_ERROR and names the failing fields", async () => {
    const res = await buildApp().request("/zod");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(Object.keys(body)).toEqual(["error"]);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toContain("quantity");
    expect(body.error.message).toContain("kind");
  });

  it("maps HTTPException to its status with a derived code", async () => {
    const res = await buildApp().request("/http-exception");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: "UNAUTHORIZED", message: "Token tidak valid" },
    });
  });

  it("returns 404 NOT_FOUND for unknown routes", async () => {
    const res = await buildApp().request("/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: { code: "NOT_FOUND", message: "Route tidak ditemukan" },
    });
  });

  it("hides unexpected error details behind a generic 500 and logs them", async () => {
    const res = await buildApp().request("/boom");
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({
      error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan pada server" },
    });
    expect(text).not.toContain("secret");
    expect(console.error).toHaveBeenCalledOnce();
  });
});
