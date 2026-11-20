import { useMounted } from "../hooks/useMounted";

// A filled share of a track. The fill is full width and scales in from the left,
// so only transform animates. The text equivalent is the meter's label and value.
export function Bar({
  value,
  max,
  label,
  fillClassName,
  trackClassName,
}: {
  value: number;
  max: number;
  label: string;
  fillClassName: string;
  trackClassName: string;
}) {
  const mounted = useMounted();
  const ratio = max > 0 ? Math.min(value / max, 1) : 0;
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={`h-2.5 overflow-hidden rounded-full ${trackClassName}`}
    >
      <div className={`grow-x h-full w-full ${fillClassName}`} style={{ transform: `scaleX(${mounted ? ratio : 0})` }} />
    </div>
  );
}
