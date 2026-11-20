import { useEffect, useState } from "react";

// False on the first paint and true two frames later, so a CSS transition from the
// empty state to the real value plays when a chart mounts.
export function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setMounted(true)));
    return () => cancelAnimationFrame(id);
  }, []);
  return mounted;
}
