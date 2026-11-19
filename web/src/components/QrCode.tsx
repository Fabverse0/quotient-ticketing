import { useMemo } from "react";
import { encode } from "uqr";

// One path of 1x1 squares, drawn here instead of injecting the library's SVG string.
export function QrCode({ value, label }: { value: string; label: string }) {
  const { size, path } = useMemo(() => {
    const qr = encode(value, { ecc: "M", border: 2 });
    let d = "";
    qr.data.forEach((row, y) =>
      row.forEach((dark, x) => {
        if (dark) d += `M${x} ${y}h1v1h-1z`;
      }),
    );
    return { size: qr.size, path: d };
  }, [value]);

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      className="size-(--size-qr) rounded-tag"
    >
      <rect width={size} height={size} className="fill-field" />
      <path d={path} className="fill-ink" />
    </svg>
  );
}
