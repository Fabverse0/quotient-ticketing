import type { Clock } from "../../src/shared/clock.js";

export interface FakeClock extends Clock {
  advance(ms: number): void;
  set(date: Date): void;
}

export function createFakeClock(start: Date): FakeClock {
  let current = start.getTime();
  return {
    now: () => new Date(current),
    advance: (ms) => {
      current += ms;
    },
    set: (date) => {
      current = date.getTime();
    },
  };
}
