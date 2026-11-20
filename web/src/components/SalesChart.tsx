import { useMounted } from "../hooks/useMounted";
import type { Sale } from "../api/organizer";
import { formatCount } from "../lib/format";

const WIDTH = 600;
const HEIGHT = 220;
const PAD = { top: 12, right: 12, bottom: 8, left: 12 };

const KINDS = [
  { kind: "REGULAR", label: "Reguler", stroke: "stroke-inkblue", dot: "fill-inkblue", swatch: "bg-inkblue" },
  { kind: "VIP", label: "VIP", stroke: "stroke-umber", dot: "fill-umber", swatch: "bg-umber" },
] as const;

const day = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short" });
const clock = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" });
const HOUR_MS = 60 * 60 * 1000;

// Short spans read as clock times, long ones as dates.
const label = (ms: number, spanMs: number) => (spanMs <= 24 * HOUR_MS ? `${clock.format(ms)} WIB` : day.format(ms));

// Cumulative seats sold, one step line per ticket type, drawn in from the left.
// The caption and legend carry the same numbers as the picture.
export function SalesChart({ sales }: { sales: Sale[] }) {
  const mounted = useMounted();
  const times = sales.map((s) => new Date(s.at).getTime());
  const start = times[0]!;
  // One instant has no width; give it a minute so the line has somewhere to go.
  const end = Math.max(times.at(-1)!, start + 60_000);
  const span = end - start;

  const totals = { REGULAR: 0, VIP: 0 };
  const lines = KINDS.map((k) => {
    let running = 0;
    const steps = sales
      .filter((s) => s.kind === k.kind)
      .map((s) => ({ t: new Date(s.at).getTime(), value: (running += s.quantity) }));
    totals[k.kind] = running;
    return { ...k, steps };
  });
  const peak = Math.max(1, ...lines.map((l) => l.steps.at(-1)?.value ?? 0));

  const x = (t: number) => PAD.left + ((t - start) / span) * (WIDTH - PAD.left - PAD.right);
  const y = (v: number) => HEIGHT - PAD.bottom - (v / peak) * (HEIGHT - PAD.top - PAD.bottom);

  // A step after each sale; the last level runs on to the end of the time range.
  const path = (steps: { t: number; value: number }[]) => {
    if (steps.length === 0) return "";
    let d = `M${x(start).toFixed(1)} ${y(0).toFixed(1)}`;
    for (const step of steps) d += ` H${x(step.t).toFixed(1)} V${y(step.value).toFixed(1)}`;
    return `${d} H${x(end).toFixed(1)}`;
  };

  const summary = `Tiket terjual dari ${label(start, span)} sampai ${label(end, span)}: ${formatCount(totals.REGULAR)} Reguler dan ${formatCount(totals.VIP)} VIP`;

  return (
    <figure className="flex flex-col gap-3">
      <div className="relative">
        <span className="absolute left-0 top-0 text-caption text-graphite tabular-nums">{formatCount(peak)} tiket</span>
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={summary} className="mt-5 h-auto w-full">
          {[0, 0.5, 1].map((f) => (
            <line
              key={f}
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={y(peak * f)}
              y2={y(peak * f)}
              className="stroke-mist"
              strokeWidth="1"
              strokeDasharray={f === 0 ? undefined : "3 5"}
            />
          ))}
          {lines.map((line) =>
            line.steps.length === 0 ? null : (
              <g key={line.kind}>
                <path
                  d={path(line.steps)}
                  pathLength={1}
                  fill="none"
                  strokeWidth="3"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                  strokeDasharray="1"
                  strokeDashoffset={mounted ? 0 : 1}
                  className={`line-draw ${line.stroke}`}
                />
                <circle cx={x(end)} cy={y(line.steps.at(-1)!.value)} r="4.5" className={`${line.dot} soft`} opacity={mounted ? 1 : 0} />
              </g>
            ),
          )}
        </svg>
      </div>
      <div className="flex justify-between text-caption text-graphite">
        <span>{label(start, span)}</span>
        <span>{label(end, span)}</span>
      </div>
      <figcaption className="flex flex-wrap gap-x-5 gap-y-1 text-small text-ink">
        {KINDS.map((k) => (
          <span key={k.kind} className="flex items-center gap-2">
            <span aria-hidden="true" className={`h-1 w-5 rounded-full ${k.swatch}`} />
            {k.label} <span className="font-bold tabular-nums">{formatCount(totals[k.kind])}</span>
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
