// One dot, one real state: the live stream, the polling fallback, or stopped for good.
export function LiveStatus({ polling, stopped }: { polling: boolean; stopped: boolean }) {
  const state = stopped
    ? { dot: "bg-oxblood", text: "Pembaruan langsung berhenti" }
    : polling
      ? { dot: "bg-ochre", text: "Sambungan terputus, diperbarui tiap 10 detik" }
      : { dot: "bg-sage", text: "Diperbarui langsung" };
  return (
    <p role="status" className="inline-flex items-center gap-2 text-small text-quiet">
      <span aria-hidden="true" className={`size-2 rounded-full ${state.dot}`} />
      {state.text}
    </p>
  );
}
