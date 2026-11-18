import type { Context } from "hono";
import type { z } from "zod";
import { AppError } from "./errors.js";

export async function parseJsonBody<S extends z.ZodType>(c: Context, schema: S): Promise<z.output<S>> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new AppError(400, "INVALID_JSON", "Body request harus berupa JSON yang valid");
  }
  return schema.parse(body);
}

export function parseParams<S extends z.ZodType>(c: Context, schema: S): z.output<S> {
  return schema.parse(c.req.param());
}
