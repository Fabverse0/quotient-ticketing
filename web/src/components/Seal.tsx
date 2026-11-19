// Double umber ring, slightly tilted, only on paid tickets.
export function Seal() {
  return (
    <span
      role="img"
      aria-label="Lunas"
      className="flex size-16 -rotate-12 items-center justify-center rounded-full border-2 border-umber p-1"
    >
      <span className="flex size-full items-center justify-center rounded-full border border-umber font-display text-label uppercase tracking-label text-umber">
        Lunas
      </span>
    </span>
  );
}
