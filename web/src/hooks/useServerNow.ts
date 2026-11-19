import { useEffect, useState } from "react";
import { serverNow } from "../lib/serverClock";

// Server-corrected "now", ticking once a second while active.
export function useServerNow(active = true) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(serverNow()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}
