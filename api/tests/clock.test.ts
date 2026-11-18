import { describe, expect, it } from "vitest";
import { systemClock } from "../src/shared/clock.js";
import { createFakeClock } from "./helpers/fake-clock.js";

describe("systemClock", () => {
  it("returns the current time", () => {
    const before = Date.now();
    const now = systemClock.now().getTime();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });
});

describe("createFakeClock", () => {
  it("stays fixed until advanced", () => {
    const clock = createFakeClock(new Date("2026-11-21T10:00:00Z"));
    expect(clock.now().toISOString()).toBe("2026-11-21T10:00:00.000Z");
    expect(clock.now().toISOString()).toBe("2026-11-21T10:00:00.000Z");
  });

  it("jumps past an order expiry without waiting", () => {
    const clock = createFakeClock(new Date("2026-11-21T10:00:00Z"));
    const expiresAt = new Date(clock.now().getTime() + 15 * 60_000);
    clock.advance(15 * 60_000 + 1);
    expect(clock.now().getTime()).toBeGreaterThan(expiresAt.getTime());
  });

  it("returns a copy so callers cannot mutate the clock", () => {
    const clock = createFakeClock(new Date("2026-11-21T10:00:00Z"));
    clock.now().setFullYear(2000);
    expect(clock.now().getUTCFullYear()).toBe(2026);
  });
});
