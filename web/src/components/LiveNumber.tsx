// A short fade when the value changes, never a count up or down. Keying on the
// value remounts the span so the animation replays on every change.
export function LiveNumber({ value, className = "" }: { value: number; className?: string }) {
  return (
    <span key={value} className={`live-number ${className}`} aria-live="polite">
      {value.toLocaleString("id-ID")}
    </span>
  );
}
