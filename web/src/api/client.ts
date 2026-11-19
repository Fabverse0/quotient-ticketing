import { ApiError, parseFieldErrors } from "./errors";
import { readToken } from "../auth/token";

// Same origin: nginx (and the Vite proxy in development) forwards /api to the API.
const BASE = "/api";

let onUnauthorized: (() => void) | undefined;

export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

export async function api<T>(path: string, { method = "GET", body }: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = readToken();
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "NETWORK", "network error");
  }

  const text = await res.text();
  const json = text ? safeParse(text) : undefined;
  if (res.ok) return json as T;

  const error = (json as { error?: { code?: string; message?: string } } | undefined)?.error;
  const code = error?.code ?? "INTERNAL_ERROR";
  const message = error?.message ?? `HTTP ${res.status}`;
  // A token that stopped working ends the session; a failed login does not.
  if (res.status === 401 && token && code !== "INVALID_CREDENTIALS") onUnauthorized?.();
  throw new ApiError(res.status, code, message, code === "VALIDATION_ERROR" ? parseFieldErrors(message) : {});
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
