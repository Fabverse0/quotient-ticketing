import { useEffect, useState } from "react";
import { serverNow } from "../lib/serverClock";

// setTimeout overflows past about 24.8 days, so long waits are taken in steps.
const MAX_STEP_MS = 60 * 60 * 1000;

// Flips to true once the server-corrected clock reaches `at`, without a re-render every second.
export function useHasPassed(at: string) {
  const target = new Date(at).getTime();
  const [passed, setPassed] = useState(() => target <= serverNow());

  useEffect(() => {
    let timer: number | undefined;
    const check = () => {
      const left = target - serverNow();
      setPassed(left <= 0);
      if (left > 0) timer = window.setTimeout(check, Math.min(left, MAX_STEP_MS));
    };
    check();
    return () => window.clearTimeout(timer);
  }, [target]);

  return passed;
}
