import { Link } from "react-router";

export function NotFoundPage() {
  return (
    <section className="flex flex-col items-center gap-4 py-24 text-center">
      <h1 className="font-display text-title text-ink">Halaman tidak ditemukan</h1>
      <Link to="/" className="link-underline text-quiet">
        Kembali ke halaman awal
      </Link>
    </section>
  );
}
