import type { Sale } from "../api/organizer";
import { useMounted } from "../hooks/useMounted";
import { formatCount, kindLabel } from "../lib/format";
import { KIND_STYLE, KINDS } from "../lib/kindStyle";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const STEPS = [MINUTE, 5 * MINUTE, 15 * MINUTE, 30 * MINUTE, HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR, DAY, 7 * DAY];
const TARGET_BARS = 8;

const day = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short" });
const clock = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" });

// Clock times for steps under a day, dates for longer ones.
const label = (ms: number, step: number) => (step < DAY ? clock.format(ms) : day.format(ms));

// Seats sold in each period, Reguler and VIP side by side. The period is the smallest
// step that keeps the chart near eight bars. Every bar carries its number, so nothing
// has to be read off the axis.
export function SalesChart({ sales }: { sales: Sale[] }) {
  const mounted = useMounted();
  const times = sales.map((s) => new Date(s.at).getTime());
  const span = times.at(-1)! - times[0]!;
  const step = STEPS.find((s) => span / s < TARGET_BARS) ?? STEPS.at(-1)!;
  const first = Math.floor(times[0]! / step) * step;
  const count = Math.floor((times.at(-1)! - first) / step) + 1;

  const buckets = Array.from({ length: count }, (_, i) => ({ start: first + i * step, REGULAR: 0, VIP: 0 }));
  sales.forEach((sale, i) => {
    buckets[Math.floor((times[i]! - first) / step)]![sale.kind] += sale.quantity;
  });
  const peak = Math.max(1, ...buckets.flatMap((b) => [b.REGULAR, b.VIP]));
  const totals = { REGULAR: 0, VIP: 0 };
  for (const b of buckets) {
    totals.REGULAR += b.REGULAR;
    totals.VIP += b.VIP;
  }

  const unit = step < HOUR ? `${step / MINUTE} menit` : step < DAY ? `${step / HOUR} jam` : `${step / DAY} hari`;
  const summary = `Tiket terjual tiap ${unit}: ${formatCount(totals.REGULAR)} Reguler dan ${formatCount(totals.VIP)} VIP`;

  return (
    <figure className="flex flex-col gap-4">
      <div role="img" aria-label={summary} className="flex gap-3">
        <div className="flex h-48 flex-col justify-between pb-0 text-caption tabular-nums text-graphite" aria-hidden="true">
          <span>{formatCount(peak)}</span>
          <span>0</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="relative flex h-48 items-end gap-2 border-b border-mist">
            <div aria-hidden="true" className="absolute inset-x-0 top-0 border-t border-dashed border-mist" />
            {buckets.map((b) => (
              <div key={b.start} className="flex h-full min-w-0 flex-1 items-end justify-center gap-1">
                {KINDS.map((kind) => (
                  <div key={kind} className="relative flex h-full w-full max-w-8 flex-col justify-end">
                    {b[kind] > 0 && (
                      <span className="mb-1 text-center text-caption font-bold tabular-nums text-ink">{formatCount(b[kind])}</span>
                    )}
                    <div
                      className={`grow-y w-full rounded-t-chip ${KIND_STYLE[kind].fill}`}
                      style={{ height: `${(b[kind] / peak) * 85}%`, transform: `scaleY(${mounted ? 1 : 0})` }}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="flex gap-2 text-caption tabular-nums text-graphite" aria-hidden="true">
            {buckets.map((b) => (
              <span key={b.start} className="min-w-0 flex-1 text-center">
                {label(b.start, step)}
              </span>
            ))}
          </div>
        </div>
      </div>
      <figcaption className="flex flex-wrap gap-x-5 gap-y-1 text-small text-ink">
        {KINDS.map((kind) => (
          <span key={kind} className="flex items-center gap-2">
            <span aria-hidden="true" className={`size-3 rounded-sm ${KIND_STYLE[kind].fill}`} />
            {kindLabel(kind)} <span className="font-bold tabular-nums">{formatCount(totals[kind])}</span>
          </span>
        ))}
        <span className="text-graphite">per {unit}</span>
      </figcaption>
    </figure>
  );
}
