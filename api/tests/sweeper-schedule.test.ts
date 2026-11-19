import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startSweeper } from "../src/jobs/sweeper.js";

const INTERVAL_MS = 30_000;

function deferred() {
  let resolve!: (value: number) => void;
  const promise = new Promise<number>((r) => (resolve = r));
  return { promise, resolve };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("startSweeper", () => {
  it("sweeps right away, then once per interval after each sweep finishes", async () => {
    const sweep = vi.fn(async () => 0);
    const sweeper = startSweeper(sweep, INTERVAL_MS);

    await vi.advanceTimersByTimeAsync(0);
    expect(sweep).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(INTERVAL_MS - 1);
    expect(sweep).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sweep).toHaveBeenCalledTimes(2);

    await sweeper.stop();
  });

  it("never starts a sweep while the previous one is still running", async () => {
    const slow = deferred();
    const sweep = vi.fn(() => slow.promise);
    const sweeper = startSweeper(sweep, INTERVAL_MS);

    await vi.advanceTimersByTimeAsync(5 * INTERVAL_MS);
    expect(sweep).toHaveBeenCalledTimes(1);

    slow.resolve(0);
    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(sweep).toHaveBeenCalledTimes(2);

    await sweeper.stop();
  });

  it("logs a failed sweep and keeps the schedule going", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const sweep = vi.fn().mockRejectedValueOnce(new Error("db down")).mockResolvedValue(0);
    const sweeper = startSweeper(sweep, INTERVAL_MS);

    await vi.advanceTimersByTimeAsync(INTERVAL_MS);

    expect(errors).toHaveBeenCalledWith(expect.any(String), expect.any(Error));
    expect(sweep).toHaveBeenCalledTimes(2);
    await sweeper.stop();
  });

  it("waits for a running sweep on stop and schedules nothing after it", async () => {
    const slow = deferred();
    const sweep = vi.fn(() => slow.promise);
    const sweeper = startSweeper(sweep, INTERVAL_MS);
    await vi.advanceTimersByTimeAsync(0);

    let stopped = false;
    const stopping = sweeper.stop().then(() => (stopped = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(stopped).toBe(false);

    slow.resolve(0);
    await stopping;
    await vi.advanceTimersByTimeAsync(5 * INTERVAL_MS);
    expect(sweep).toHaveBeenCalledTimes(1);
  });
});
