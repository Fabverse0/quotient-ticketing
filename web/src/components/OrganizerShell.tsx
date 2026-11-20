import type { ReactNode } from "react";
import { Link, Outlet, useLocation } from "react-router";
import { useSession } from "../auth/session";
import { LogoMark } from "./Logo";
import { IconAnalytics, IconEvents, IconExit, IconOverview, IconPlus } from "./NavIcons";

interface Item {
  to: string;
  label: string;
  icon: () => ReactNode;
  // Analytics owns every single-event page, so it stays lit while one is open.
  active: (path: string) => boolean;
}

const ITEMS: Item[] = [
  { to: "/organizer", label: "Ringkasan", icon: IconOverview, active: (p) => p === "/organizer" },
  {
    to: "/organizer/analitik",
    label: "Analitik",
    icon: IconAnalytics,
    active: (p) => p === "/organizer/analitik" || /^\/organizer\/event\/(?!baru$)[^/]+$/.test(p),
  },
  { to: "/organizer/event", label: "Event saya", icon: IconEvents, active: (p) => p === "/organizer/event" },
  { to: "/organizer/event/baru", label: "Buat event", icon: IconPlus, active: (p) => p === "/organizer/event/baru" },
];

const itemBase =
  "soft flex flex-col items-center gap-1 rounded-chip px-2 py-2 text-label focus-visible:outline-canvas";

function NavItem({ item, current }: { item: Item; current: boolean }) {
  return (
    <Link
      to={item.to}
      aria-current={current ? "page" : undefined}
      className={`${itemBase} min-h-(--size-button) min-w-16 justify-center ${
        current ? "bg-canvas text-ink" : "text-blue-mist hover:bg-inkblue-deep hover:text-canvas"
      }`}
    >
      {item.icon()}
      <span>{item.label}</span>
    </Link>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");

// The organizer area: an icon rail on wide screens, a bar at the bottom on phones.
// The page behind it lives in one large rounded panel.
export function OrganizerShell() {
  const { user, signOut } = useSession();
  const path = useLocation().pathname.replace(/\/$/, "") || "/";

  const exit = (
    <button type="button" onClick={signOut} className={`${itemBase} min-h-(--size-button) min-w-16 justify-center text-blue-mist hover:bg-inkblue-deep hover:text-canvas`}>
      <IconExit />
      <span>Keluar</span>
    </button>
  );

  return (
    <div className="min-h-dvh bg-canvas p-(--shell-gutter) md:flex md:gap-(--shell-gutter)">
      <aside
        aria-label="Navigasi organizer"
        className="sticky top-(--shell-gutter) hidden h-[calc(100dvh-2*var(--shell-gutter))] w-24 shrink-0 flex-col items-center rounded-shell bg-inkblue py-6 md:flex"
      >
        <Link
          to="/organizer"
          aria-label="Quotient, ke ringkasan"
          className="flex size-12 items-center justify-center rounded-chip focus-visible:outline-canvas"
        >
          <LogoMark className="size-9 text-canvas" tailClassName="fill-umber-light" />
        </Link>
        <nav className="mt-8 flex flex-1 flex-col gap-2">
          {ITEMS.map((item) => (
            <NavItem key={item.to} item={item} current={item.active(path)} />
          ))}
        </nav>
        <div className="flex flex-col items-center gap-3">
          <span
            title={user?.name}
            aria-hidden="true"
            className="flex size-10 items-center justify-center rounded-full bg-clay text-small font-bold text-ink"
          >
            {user ? initials(user.name) : ""}
          </span>
          {exit}
        </div>
      </aside>

      <div className="min-w-0 flex-1 rounded-shell bg-field px-5 pb-32 pt-6 sm:px-8 md:min-h-[calc(100dvh-2*var(--shell-gutter))] md:pb-10 md:pt-8">
        <Outlet />
      </div>

      <nav
        aria-label="Navigasi organizer"
        className="fixed inset-x-(--shell-gutter) bottom-(--shell-gutter) z-10 flex justify-between rounded-shell bg-inkblue p-2 md:hidden"
      >
        {ITEMS.map((item) => (
          <NavItem key={item.to} item={item} current={item.active(path)} />
        ))}
        {exit}
      </nav>
    </div>
  );
}
