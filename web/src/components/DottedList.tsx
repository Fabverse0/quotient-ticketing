import type { ReactNode } from "react";

// "Reguler ......... Rp75.000": a dotted leader between label and value.
export function DottedList({ rows }: { rows: Array<{ label: ReactNode; value: ReactNode; muted?: boolean }> }) {
  return (
    <dl className="flex flex-col gap-3">
      {rows.map((row, i) => (
        <div key={i} className={`flex items-baseline gap-2 ${row.muted ? "text-quiet" : "text-ink"}`}>
          <dt className="shrink-0">{row.label}</dt>
          <span aria-hidden="true" className="min-w-4 flex-1 -translate-y-1 border-b border-dotted border-ash" />
          <dd className="shrink-0 font-bold">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
