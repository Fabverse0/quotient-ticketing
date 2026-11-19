import { Link, NavLink, Outlet } from "react-router";
import { useSession } from "../auth/session";

const navLink = ({ isActive }: { isActive: boolean }) =>
  `inline-flex min-h-(--size-button) items-center text-sm ${isActive ? "text-ink" : "text-quiet"}`;

// Only pages that exist are linked, per role.
export function Layout() {
  const { user, signOut } = useSession();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-6 sm:px-8">
        <Link to="/" className="flex min-h-(--size-button) items-center gap-3 text-ink" aria-label="Quotient, ke halaman awal">
          <span
            aria-hidden="true"
            className="flex size-9 items-center justify-center rounded-full border border-ink font-display text-lg"
          >
            Q
          </span>
          <span className="hidden font-display text-lg sm:inline">Quotient</span>
        </Link>
        <nav aria-label="Navigasi utama" className="flex items-center gap-4 sm:gap-5">
          {user?.role !== "organizer" && (
            <NavLink to="/" end className={navLink}>
              <span className="link-underline">Event</span>
            </NavLink>
          )}
          {user?.role === "buyer" && (
            <>
              <NavLink to="/pesanan" className={navLink}>
                <span className="link-underline">Pesanan</span>
              </NavLink>
              <NavLink to="/tiket" className={navLink}>
                <span className="link-underline">Tiket saya</span>
              </NavLink>
            </>
          )}
          {user?.role === "organizer" && (
            <NavLink to="/organizer" className={navLink}>
              <span className="link-underline">Dashboard</span>
            </NavLink>
          )}
          {user ? (
            <>
              <span className="hidden text-sm text-quiet lg:inline">{user.name}</span>
              <button type="button" onClick={signOut} className="inline-flex min-h-(--size-button) items-center text-sm text-quiet">
                <span className="link-underline">Keluar</span>
              </button>
            </>
          ) : (
            <NavLink to="/masuk" className={navLink}>
              <span className="link-underline">Masuk</span>
            </NavLink>
          )}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 sm:px-8">
        <Outlet />
      </main>
    </div>
  );
}
