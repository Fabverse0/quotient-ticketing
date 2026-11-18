import { sign, verify } from "hono/jwt";
import { z } from "zod";
import { userRole } from "../../shared/db/schema.js";

export type Role = (typeof userRole.enumValues)[number];

export interface TokenClaims {
  userId: string;
  role: Role;
}

interface IssueOptions {
  secret: string;
  expiresInSeconds: number;
  now: Date;
}

// `exp` is required: hono only checks expiry when the claim is present.
const payloadSchema = z.object({
  user_id: z.uuid(),
  role: z.enum(userRole.enumValues),
  exp: z.number(),
});

export function issueToken(claims: TokenClaims, { secret, expiresInSeconds, now }: IssueOptions): Promise<string> {
  const iat = Math.floor(now.getTime() / 1000);
  return sign(
    { user_id: claims.userId, role: claims.role, iat, exp: iat + expiresInSeconds },
    secret,
    "HS256",
  );
}

export async function verifyToken(token: string, secret: string): Promise<TokenClaims | null> {
  try {
    const payload = payloadSchema.safeParse(await verify(token, secret, "HS256"));
    return payload.success ? { userId: payload.data.user_id, role: payload.data.role } : null;
  } catch {
    return null;
  }
}
