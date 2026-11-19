import { useSession } from "../auth/session";

// An honest placeholder until the dashboard module: nothing here pretends to work.
export function DashboardPage() {
  const { user } = useSession();
  return (
    <section className="py-16">
      <p className="text-label uppercase tracking-label text-quiet">Dashboard organizer</p>
      <h1 className="mt-2 font-display text-title text-ink">Halo, {user?.name}</h1>
      <p className="mt-4 max-w-(--width-lead) text-graphite">
        Dashboard sedang disiapkan. Angka kuota, peta kursi, dan pemeriksaan invariant akan tampil di sini.
      </p>
    </section>
  );
}
