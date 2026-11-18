import type { Clock } from "../../shared/clock.js";
import type { Database } from "../../shared/db/client.js";
import { AppError } from "../../shared/errors.js";
import { hashPassword, verifyPassword } from "./password.js";
import { findUserByEmail, findUserById, insertUserIfNew, type UserRow } from "./queries.js";
import { issueToken } from "./token.js";

export interface AuthSettings {
  secret: string;
  expiresInSeconds: number;
}

export type UserProfile = Pick<UserRow, "id" | "email" | "name" | "role">;

export interface AuthResult {
  token: string;
  user: UserProfile;
}

export function createAuthService({ db, clock, settings }: { db: Database; clock: Clock; settings: AuthSettings }) {
  // Hashing a throwaway password for unknown emails keeps login time similar
  // whether or not the account exists.
  let dummyHash: Promise<string> | undefined;

  async function toResult(user: UserRow): Promise<AuthResult> {
    const token = await issueToken(
      { userId: user.id, role: user.role },
      { secret: settings.secret, expiresInSeconds: settings.expiresInSeconds, now: clock.now() },
    );
    return { token, user: { id: user.id, email: user.email, name: user.name, role: user.role } };
  }

  return {
    async registerBuyer(input: { email: string; password: string; name: string }): Promise<AuthResult> {
      const user = await insertUserIfNew(db, {
        email: input.email,
        name: input.name,
        passwordHash: await hashPassword(input.password),
        role: "buyer",
      });
      if (!user) {
        throw new AppError(409, "EMAIL_TAKEN", "Email sudah terdaftar");
      }
      return toResult(user);
    },

    async login(input: { email: string; password: string }): Promise<AuthResult> {
      const user = await findUserByEmail(db, input.email);
      dummyHash ??= hashPassword("not-a-real-password");
      const valid = await verifyPassword(input.password, user?.passwordHash ?? (await dummyHash));
      if (!user || !valid) {
        throw new AppError(401, "INVALID_CREDENTIALS", "Email atau password salah");
      }
      return toResult(user);
    },

    async getProfile(userId: string): Promise<UserProfile> {
      const user = await findUserById(db, userId);
      if (!user) {
        throw new AppError(401, "INVALID_TOKEN", "Akun untuk token ini tidak ditemukan");
      }
      return { id: user.id, email: user.email, name: user.name, role: user.role };
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
