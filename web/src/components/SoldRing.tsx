import { formatCount, formatPercent, kindLabel } from "../lib/format";
import { KIND_STYLE, KINDS } from "../lib/kindStyle";
import { Ring } from "./Ring";

export function SoldRing({
  quota,
  regular,
  vip,
  className = "size-40",
}: {
  quota: number;
  regular: number;
  vip: number;
  className?: string;
}) {
  const sold = regular + vip;
  const counts = { REGULAR: regular, VIP: vip };
  return (
    <div className="flex flex-wrap items-center gap-6">
      <Ring
        className={className}
        total={quota}
        trackClassName="stroke-inkblue-deep"
        label={`${formatCount(sold)} dari ${formatCount(quota)} kursi terjual: ${formatCount(regular)} Reguler dan ${formatCount(vip)} VIP`}
        segments={[
          { value: regular, className: "stroke-canvas" },
          { value: vip, className: "stroke-umber-light" },
        ]}
      >
        <span className="text-title font-bold">{formatPercent(quota > 0 ? sold / quota : 0)}</span>
        <span className="text-caption text-blue-mist">terisi</span>
      </Ring>
      <ul className="flex flex-col gap-2 text-small">
        {KINDS.map((kind) => (
          <li key={kind} className="flex items-center gap-2">
            <span aria-hidden="true" className={`size-3 rounded-full ${KIND_STYLE[kind].swatch}`} />
            <span className="text-blue-mist">{kindLabel(kind)}</span>
            <span className="font-bold">{formatCount(counts[kind])}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
