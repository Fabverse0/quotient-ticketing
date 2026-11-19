import { Link, NavLink, Outlet } from "react-router";
import { useSession } from "../auth/session";

const navLink = ({ isActive }: { isActive: boolean }) =>
  `link-underline text-sm ${isActive ? "text-ink" : "text-quiet"}`;

// Only pages that exist are linked; "Tiket saya" arrives with its page.
export function Layout() {
  const { user, signOut } = useSession();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-6 sm:px-8">
        <Link to="/" className="flex items-center gap-3 text-ink" aria-label="Quotient, ke halaman awal">
          <span
            aria-hidden="true"
            className="flex size-9 items-center justify-center rounded-full border border-ink font-display text-lg"
          >
            Q
          </span>
          <span className="font-display text-lg">Quotient</span>
        </Link>
        <nav aria-label="Navigasi utama" className="flex items-center gap-5">
          {user?.role === "buyer" && (
            <NavLink to="/" end className={navLink}>
              Event
            </NavLink>
          )}
          {user?.role === "organizer" && (
            <NavLink to="/organizer" className={navLink}>
              Dashboard
            </NavLink>
          )}
          {user ? (
            <>
              <span className="hidden text-sm text-quiet sm:inline">{user.name}</span>
              <button type="button" onClick={signOut} className="link-underline text-sm text-quiet">
                Keluar
              </button>
            </>
          ) : (
            <NavLink to="/masuk" className={navLink}>
              Masuk
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
