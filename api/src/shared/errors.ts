import type { Env, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ZodError } from "zod";

export class AppError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

interface ErrorBody {
  error: { code: string; message: string };
}

const body = (code: string, message: string): ErrorBody => ({ error: { code, message } });

const STATUS_CODES: Record<number, string> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  405: "METHOD_NOT_ALLOWED",
  409: "CONFLICT",
  413: "PAYLOAD_TOO_LARGE",
  415: "UNSUPPORTED_MEDIA_TYPE",
  429: "TOO_MANY_REQUESTS",
};

function describeZodError(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const field = issue.path.join(".");
      return field ? `${field}: ${issue.message}` : issue.message;
    })
    .join("; ");
}

export function registerErrorHandling<E extends Env>(app: Hono<E>): void {
  app.notFound((c) => c.json(body("NOT_FOUND", "Route tidak ditemukan"), 404));

  app.onError((err, c) => {
    if (err instanceof AppError) {
      return c.json(body(err.code, err.message), err.status);
    }
    if (err instanceof ZodError) {
      return c.json(body("VALIDATION_ERROR", describeZodError(err)), 400);
    }
    if (err instanceof HTTPException) {
      const code = STATUS_CODES[err.status] ?? "HTTP_ERROR";
      return c.json(body(code, err.message), err.status as ContentfulStatusCode);
    }
    console.error(err);
    return c.json(body("INTERNAL_ERROR", "Terjadi kesalahan pada server"), 500);
  });
}
