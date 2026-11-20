import type { ReactNode } from "react";

// A figure on the dark hero card.
export function HeroStat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-chip bg-inkblue-deep px-4 py-3">
      <dt className="text-caption text-blue-mist">{label}</dt>
      <dd className="mt-1 text-lead font-bold tabular-nums">{children}</dd>
    </div>
  );
}
