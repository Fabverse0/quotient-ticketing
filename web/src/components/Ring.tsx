import type { ReactNode } from "react";
import { useMounted } from "../hooks/useMounted";

export interface RingSegment {
  value: number;
  // A Tailwind stroke class, so the colour comes from a token.
  className: string;
}

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// Arcs laid end to end on a track, each drawing in from nothing. `label` is the
// text equivalent of the picture; the centre holds whatever the caller puts in it.
export function Ring({
  segments,
  total,
  label,
  trackClassName,
  className = "size-48",
  children,
}: {
  segments: RingSegment[];
  total: number;
  label: string;
  trackClassName: string;
  className?: string;
  children?: ReactNode;
}) {
  const mounted = useMounted();
  let used = 0;
  return (
    <div className={`relative ${className}`}>
      <svg viewBox="0 0 120 120" role="img" aria-label={label} className="size-full -rotate-90">
        <circle cx="60" cy="60" r={RADIUS} fill="none" strokeWidth="12" className={trackClassName} />
        {segments.map((segment, i) => {
          const length = total > 0 ? Math.min(segment.value / total, 1) * CIRCUMFERENCE : 0;
          const offset = used;
          used += length;
          return (
            <circle
              key={i}
              cx="60"
              cy="60"
              r={RADIUS}
              fill="none"
              strokeWidth="12"
              className={`ring-arc ${segment.className}`}
              strokeDasharray={`${mounted ? length : 0} ${CIRCUMFERENCE}`}
              strokeDashoffset={-offset}
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}
