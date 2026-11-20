import { useEffect, useRef, useState } from "react";

const DURATION_MS = 1200;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 4);

// Counts from the number on screen to the new value, slowly and without overshoot.
// Reduced motion shows the value at once. The count is hidden from screen readers,
// which get the final value.
export function CountUp({
  value,
  format = (n: number) => Math.round(n).toLocaleString("id-ID"),
  className = "",
}: {
  value: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      from.current = value;
      setShown(value);
      return;
    }
    const origin = from.current;
    const start = performance.now();
    let id = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION_MS);
      const next = origin + (value - origin) * easeOut(t);
      from.current = next;
      setShown(next);
      if (t < 1) id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [value]);

  return (
    <span className={className}>
      <span aria-hidden="true">{format(shown)}</span>
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}
