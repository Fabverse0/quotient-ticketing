import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/shared/config.js";

const validEnv = { DATABASE_URL: "postgres://u:p@localhost:5432/db" };

describe("loadConfig", () => {
  it("applies defaults for optional variables", () => {
    const config = loadConfig(validEnv);
    expect(config).toEqual({
      nodeEnv: "development",
      port: 3000,
      databaseUrl: "postgres://u:p@localhost:5432/db",
      dbPoolMax: 10,
    });
  });

  it("coerces numeric strings", () => {
    const config = loadConfig({ ...validEnv, PORT: "8080", DB_POOL_MAX: "25" });
    expect(config.port).toBe(8080);
    expect(config.dbPoolMax).toBe(25);
  });

  it("fails when DATABASE_URL is missing and names the variable", () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });

  it("rejects a DATABASE_URL that is not a postgres URL", () => {
    expect(() => loadConfig({ DATABASE_URL: "mysql://localhost/db" })).toThrow(/DATABASE_URL/);
  });

  it("rejects an out-of-range port", () => {
    expect(() => loadConfig({ ...validEnv, PORT: "70000" })).toThrow(/PORT/);
  });

  it("rejects an unknown NODE_ENV", () => {
    expect(() => loadConfig({ ...validEnv, NODE_ENV: "staging" })).toThrow(/NODE_ENV/);
  });
});
