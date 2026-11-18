import { createMiddleware } from "hono/factory";
import { AppError } from "../../shared/errors.js";
import { verifyToken, type Role, type TokenClaims } from "./token.js";

export interface AuthEnv {
  Variables: { auth: TokenClaims };
}

export function requireAuth(secret: string) {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const [scheme, token] = c.req.header("Authorization")?.split(" ") ?? [];
    if (scheme?.toLowerCase() !== "bearer" || !token) {
      throw new AppError(401, "UNAUTHORIZED", "Token autentikasi diperlukan");
    }
    const claims = await verifyToken(token, secret);
    if (!claims) {
      throw new AppError(401, "INVALID_TOKEN", "Token tidak valid atau sudah kedaluwarsa");
    }
    c.set("auth", claims);
    await next();
  });
}

export function requireRole(...roles: Role[]) {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const auth = c.get("auth");
    if (!auth) {
      throw new Error("requireRole must run after requireAuth");
    }
    if (!roles.includes(auth.role)) {
      throw new AppError(403, "FORBIDDEN", "Peran Anda tidak boleh mengakses resource ini");
    }
    await next();
  });
}
