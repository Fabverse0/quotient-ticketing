import type { ReactNode } from "react";

export type StatusTone = "sage" | "ochre" | "oxblood" | "inkblue" | "umber" | "quiet";

const tones: Record<StatusTone, string> = {
  sage: "border-sage text-sage",
  ochre: "border-ochre text-ochre-text",
  oxblood: "border-oxblood text-oxblood",
  inkblue: "border-inkblue text-inkblue",
  umber: "border-umber text-umber",
  quiet: "border-ash text-quiet",
};

// Status color only on text and border; "Perlu refund" is the one filled label.
export function StatusLabel({ tone, filled = false, children }: { tone: StatusTone; filled?: boolean; children: ReactNode }) {
  const look = filled ? "border-oxblood bg-oxblood text-canvas" : tones[tone];
  return (
    <span
      className={`inline-block rounded-tag border px-1.5 py-0.5 text-label uppercase tracking-label ${look}`}
    >
      {children}
    </span>
  );
}
