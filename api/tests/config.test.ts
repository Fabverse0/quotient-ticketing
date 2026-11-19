import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/shared/config.js";

const validEnv = {
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  JWT_SECRET: "a-test-secret-that-is-at-least-32-chars",
  PAYMENT_WEBHOOK_SECRET: "a-webhook-secret-that-is-32-chars-long",
};

describe("loadConfig", () => {
  it("applies defaults for optional variables", () => {
    const config = loadConfig(validEnv);
    expect(config).toEqual({
      nodeEnv: "development",
      port: 3000,
      databaseUrl: "postgres://u:p@localhost:5432/db",
      dbPoolMax: 10,
      dbConnectionTimeoutMs: 5000,
      dbLockTimeoutMs: 5000,
      jwtSecret: validEnv.JWT_SECRET,
      jwtExpiresInSeconds: 3600,
      quotaStrategy: "atomic",
      paymentWebhookSecret: validEnv.PAYMENT_WEBHOOK_SECRET,
      simulatedPaymentEnabled: true,
      sweeper: { enabled: true, intervalMs: 30_000 },
    });
    expect(config.organizer).toBeUndefined();
  });

  it("coerces numeric strings", () => {
    const config = loadConfig({ ...validEnv, PORT: "8080", DB_POOL_MAX: "25" });
    expect(config.port).toBe(8080);
    expect(config.dbPoolMax).toBe(25);
  });

  it("reads the database connection and lock timeouts", () => {
    const config = loadConfig({ ...validEnv, DB_CONNECTION_TIMEOUT_MS: "2500", DB_LOCK_TIMEOUT_MS: "750" });
    expect(config.dbConnectionTimeoutMs).toBe(2500);
    expect(config.dbLockTimeoutMs).toBe(750);
  });

  it("rejects database timeouts outside 100 ms to 60 s", () => {
    expect(() => loadConfig({ ...validEnv, DB_CONNECTION_TIMEOUT_MS: "0" })).toThrow(/DB_CONNECTION_TIMEOUT_MS/);
    expect(() => loadConfig({ ...validEnv, DB_LOCK_TIMEOUT_MS: "60001" })).toThrow(/DB_LOCK_TIMEOUT_MS/);
  });

  it("fails when DATABASE_URL is missing and names the variable", () => {
    expect(() =>
      loadConfig({ JWT_SECRET: validEnv.JWT_SECRET, PAYMENT_WEBHOOK_SECRET: validEnv.PAYMENT_WEBHOOK_SECRET }),
    ).toThrow(/DATABASE_URL/);
  });

  it("rejects a DATABASE_URL that is not a postgres URL", () => {
    expect(() => loadConfig({ ...validEnv, DATABASE_URL: "mysql://localhost/db" })).toThrow(/DATABASE_URL/);
  });

  it("rejects an out-of-range port", () => {
    expect(() => loadConfig({ ...validEnv, PORT: "70000" })).toThrow(/PORT/);
  });

  it.each([
    ["development", true],
    ["test", true],
    ["production", false],
  ])("with NODE_ENV=%s the simulated payment endpoint enabled is %s", (nodeEnv, enabled) => {
    expect(loadConfig({ ...validEnv, NODE_ENV: nodeEnv }).simulatedPaymentEnabled).toBe(enabled);
  });

  it("rejects an unknown NODE_ENV", () => {
    expect(() => loadConfig({ ...validEnv, NODE_ENV: "staging" })).toThrow(/NODE_ENV/);
  });

  it("requires JWT_SECRET of at least 32 characters", () => {
    expect(() => loadConfig({ DATABASE_URL: validEnv.DATABASE_URL })).toThrow(/JWT_SECRET/);
    expect(() => loadConfig({ ...validEnv, JWT_SECRET: "too-short" })).toThrow(/JWT_SECRET/);
  });

  it("requires PAYMENT_WEBHOOK_SECRET of at least 32 characters", () => {
    const { PAYMENT_WEBHOOK_SECRET: _, ...withoutSecret } = validEnv;
    expect(() => loadConfig(withoutSecret)).toThrow(/PAYMENT_WEBHOOK_SECRET/);
    expect(() => loadConfig({ ...validEnv, PAYMENT_WEBHOOK_SECRET: "too-short" })).toThrow(/PAYMENT_WEBHOOK_SECRET/);
  });

  it.each([
    ["30m", 1800],
    ["1h", 3600],
    ["7d", 604800],
    ["45s", 45],
  ])("parses JWT_EXPIRES_IN %s into %i seconds", (value, seconds) => {
    expect(loadConfig({ ...validEnv, JWT_EXPIRES_IN: value }).jwtExpiresInSeconds).toBe(seconds);
  });

  it("rejects a malformed JWT_EXPIRES_IN", () => {
    expect(() => loadConfig({ ...validEnv, JWT_EXPIRES_IN: "soon" })).toThrow(/JWT_EXPIRES_IN/);
  });

  it("reads the organizer seed account when both variables are set", () => {
    const config = loadConfig({
      ...validEnv,
      ORGANIZER_EMAIL: "admin@quotient.test",
      ORGANIZER_PASSWORD: "organizer-pass",
    });
    expect(config.organizer).toEqual({ email: "admin@quotient.test", password: "organizer-pass" });
  });

  it("treats empty organizer variables as unset", () => {
    const config = loadConfig({ ...validEnv, ORGANIZER_EMAIL: "", ORGANIZER_PASSWORD: "" });
    expect(config.organizer).toBeUndefined();
  });

  it("rejects an organizer email without a password", () => {
    expect(() => loadConfig({ ...validEnv, ORGANIZER_EMAIL: "admin@quotient.test" })).toThrow(
      /ORGANIZER_PASSWORD/,
    );
  });

  it("reads the sweeper switch and interval", () => {
    const config = loadConfig({ ...validEnv, SWEEPER_ENABLED: "false", SWEEPER_INTERVAL_MS: "5000" });
    expect(config.sweeper).toEqual({ enabled: false, intervalMs: 5000 });
    expect(loadConfig({ ...validEnv, SWEEPER_ENABLED: "true" }).sweeper.enabled).toBe(true);
  });

  it("rejects an invalid sweeper switch or an interval under one second", () => {
    expect(() => loadConfig({ ...validEnv, SWEEPER_ENABLED: "maybe" })).toThrow(/SWEEPER_ENABLED/);
    expect(() => loadConfig({ ...validEnv, SWEEPER_INTERVAL_MS: "999" })).toThrow(/SWEEPER_INTERVAL_MS/);
    expect(() => loadConfig({ ...validEnv, SWEEPER_INTERVAL_MS: "1.5" })).toThrow(/SWEEPER_INTERVAL_MS/);
  });

  it("accepts the naive quota strategy", () => {
    expect(loadConfig({ ...validEnv, QUOTA_STRATEGY: "naive" }).quotaStrategy).toBe("naive");
  });

  it("rejects an unknown QUOTA_STRATEGY", () => {
    expect(() => loadConfig({ ...validEnv, QUOTA_STRATEGY: "optimistic" })).toThrow(/QUOTA_STRATEGY/);
  });
});
