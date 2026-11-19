// Blurred earth-tone cover, picked from a hash of the seed so it never changes
// for the same event. Decorative: hidden from assistive tech.
const EARTH = ["var(--color-umber)", "var(--color-ochre)", "var(--color-sage)", "var(--color-oxblood)", "var(--color-inkblue)", "var(--color-carbon)"];

function hash(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function Cover({ seed, muted = false, className = "" }: { seed: string; muted?: boolean; className?: string }) {
  const h = hash(seed);
  const pick = (n: number) => EARTH[(h >>> (n * 3)) % EARTH.length];
  return (
    <div
      aria-hidden="true"
      className={`relative overflow-hidden rounded-cover bg-wall shadow-rest [contain:paint] ${muted ? "opacity-60 grayscale" : ""} ${className}`}
    >
      <div className="absolute inset-[-12%] blur-(--blur-cover)">
        <div className="absolute left-0 top-0 h-1/2 w-3/5" style={{ background: pick(0) }} />
        <div className="absolute right-0 top-[20%] h-3/5 w-1/2" style={{ background: pick(1) }} />
        <div className="absolute bottom-0 left-[15%] h-2/5 w-2/3" style={{ background: pick(2) }} />
      </div>
    </div>
  );
}
