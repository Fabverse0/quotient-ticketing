import { formatCount } from "../lib/format";

// At most this many boxes; above it each box stands for several seats.
const MAX_BOXES = 200;

interface Props {
  quota: number;
  // Buyers only learn how many seats are taken; organizers see sold and held apart.
  taken?: number;
  sold?: number;
  reserved?: number;
  size?: "small" | "large";
}

export function SeatMap({ quota, taken = 0, sold, reserved, size = "small" }: Props) {
  const perBox = Math.max(1, Math.ceil(quota / MAX_BOXES));
  const boxes = Math.ceil(quota / perBox);
  const split = sold !== undefined && reserved !== undefined;
  const soldBoxes = Math.min(boxes, Math.round((split ? sold : taken) / perBox));
  const heldBoxes = split ? Math.min(boxes - soldBoxes, Math.round(reserved / perBox)) : 0;
  const free = quota - (split ? sold + reserved : taken);
  const cell = size === "large" ? "size-(--size-seat-large)" : "size-(--size-seat)";

  const summary = split
    ? `${formatCount(sold)} terjual, ${formatCount(reserved)} ditahan, ${formatCount(free)} tersedia dari ${formatCount(quota)} kursi`
    : `${formatCount(quota - free)} terisi, ${formatCount(free)} tersedia dari ${formatCount(quota)} kursi`;

  return (
    <figure className="flex flex-col gap-3">
      <div role="img" aria-label={summary} className="flex flex-wrap gap-1">
        {Array.from({ length: boxes }, (_, i) => {
          const look =
            i < soldBoxes
              ? "border-ink bg-ink"
              : i < soldBoxes + heldBoxes
                ? "border-umber bg-umber"
                : "border-ash bg-transparent";
          return <span key={i} className={`${cell} rounded-seat border transition-colors duration-(--dur-fast) ${look}`} />;
        })}
      </div>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-quiet">
        <Legend look="border-ink bg-ink" label={split ? "Terjual" : "Terisi"} />
        {split && <Legend look="border-umber bg-umber" label="Ditahan" />}
        <Legend look="border-ash" label="Tersedia" />
        {perBox > 1 && <span>1 kotak = {formatCount(perBox)} kursi</span>}
      </figcaption>
    </figure>
  );
}

function Legend({ look, label }: { look: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className={`size-(--size-seat) rounded-seat border ${look}`} />
      {label}
    </span>
  );
}
