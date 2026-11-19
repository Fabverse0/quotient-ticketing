import { z } from "zod";

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

export const QUOTA_STRATEGIES = ["atomic", "naive"] as const;
export type QuotaStrategyName = (typeof QUOTA_STRATEGIES)[number];

const DURATION_UNITS = { s: 1, m: 60, h: 3600, d: 86400 } as const;

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, "must start with postgres:// or postgresql://"),
    DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
    JWT_SECRET: z.string().min(32, "must be at least 32 characters"),
    JWT_EXPIRES_IN: z
      .string()
      .regex(/^\d+[smhd]$/, "must look like 30m, 1h or 7d")
      .default("1h"),
    QUOTA_STRATEGY: z.enum(QUOTA_STRATEGIES).default("atomic"),
    PAYMENT_WEBHOOK_SECRET: z.string().min(32, "must be at least 32 characters"),
    ORGANIZER_EMAIL: z.preprocess(emptyToUndefined, z.email().optional()),
    ORGANIZER_PASSWORD: z.preprocess(emptyToUndefined, z.string().min(8).max(72).optional()),
  })
  .refine((env) => Boolean(env.ORGANIZER_EMAIL) === Boolean(env.ORGANIZER_PASSWORD), {
    message: "ORGANIZER_EMAIL and ORGANIZER_PASSWORD must be set together",
    path: ["ORGANIZER_PASSWORD"],
  });

export interface Config {
  nodeEnv: "development" | "test" | "production";
  port: number;
  databaseUrl: string;
  dbPoolMax: number;
  jwtSecret: string;
  jwtExpiresInSeconds: number;
  quotaStrategy: QuotaStrategyName;
  paymentWebhookSecret: string;
  // POST /orders/:id/pay is a stand-in for a real provider; never in production.
  simulatedPaymentEnabled: boolean;
  organizer?: { email: string; password: string };
}

function durationToSeconds(value: string): number {
  const unit = value.slice(-1) as keyof typeof DURATION_UNITS;
  return Number(value.slice(0, -1)) * DURATION_UNITS[unit];
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(parsed.error)}`);
  }
  const e = parsed.data;
  return {
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    databaseUrl: e.DATABASE_URL,
    dbPoolMax: e.DB_POOL_MAX,
    jwtSecret: e.JWT_SECRET,
    jwtExpiresInSeconds: durationToSeconds(e.JWT_EXPIRES_IN),
    quotaStrategy: e.QUOTA_STRATEGY,
    paymentWebhookSecret: e.PAYMENT_WEBHOOK_SECRET,
    simulatedPaymentEnabled: e.NODE_ENV !== "production",
    ...(e.ORGANIZER_EMAIL && e.ORGANIZER_PASSWORD
      ? { organizer: { email: e.ORGANIZER_EMAIL, password: e.ORGANIZER_PASSWORD } }
      : {}),
  };
}
