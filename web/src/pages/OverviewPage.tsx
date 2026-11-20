import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { messageFor } from "../api/errors";
import type { TicketKind } from "../api/events";
import { listMyEvents, type OrganizerEvent } from "../api/organizer";
import { useSession } from "../auth/session";
import { Bar } from "../components/Bar";
import { CountUp } from "../components/CountUp";
import { LiveStatus } from "../components/LiveStatus";
import { PageMessage } from "../components/PageState";
import { HeroStat } from "../components/HeroStat";
import { SoldRing } from "../components/SoldRing";
import { POLL_MS } from "../hooks/useLiveStream";
import { useOverviewLive } from "../hooks/useOverviewLive";
import { formatCount, formatDateTime, formatDayMonth, formatPercent, formatRupiah, kindLabel } from "../lib/format";
import { summarize, type Overview, type Totals } from "../lib/overview";
import { KIND_STYLE, KINDS } from "../lib/kindStyle";
import { serverNow } from "../lib/serverClock";
import { stagger } from "../lib/stagger";

const card = "rise rounded-card bg-wall p-6";

const hourFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "numeric", hourCycle: "h23" });
function greeting(now: number) {
  const hour = Number(hourFormat.format(new Date(now)));
  if (hour < 11) return "Selamat pagi";
  if (hour < 15) return "Selamat siang";
  if (hour < 18) return "Selamat sore";
  return "Selamat malam";
}

const rupiah = (n: number) => formatRupiah(Math.round(n));

export function OverviewPage() {
  const { user } = useSession();
  const { polling } = useOverviewLive();
  const events = useQuery({
    queryKey: ["organizer-events"],
    queryFn: listMyEvents,
    refetchInterval: polling ? POLL_MS : false,
  });

  if (events.isPending) return <OverviewLoading />;
  if (events.isError) {
    return (
      <PageMessage action={{ label: "Muat ulang ringkasan", onClick: () => void events.refetch() }}>
        {messageFor(events.error)}
      </PageMessage>
    );
  }
  if (events.data.length === 0) {
    return (
      <PageMessage ornament>
        Belum ada event.{" "}
        <Link to="/organizer/event/baru" className="link-underline text-ink">
          Buat event pertamamu
        </Link>
      </PageMessage>
    );
  }

  const now = serverNow();
  const overview = summarize(events.data);
  const upcoming = events.data.filter((e) => new Date(e.startsAt).getTime() > now).slice(0, 4);
  const firstName = user?.name.split(/\s+/)[0] ?? "";

  return (
    <div className="flex flex-col gap-6">
      <header className="rise flex flex-wrap items-end justify-between gap-4" style={stagger(0)}>
        <div>
          <h1 className="text-title font-bold text-ink">
            {greeting(now)}, {firstName}
          </h1>
          <p className="mt-1 text-small text-quiet">
            {formatCount(events.data.length)} event, {formatCount(overview.sold)} tiket terjual sejauh ini.
          </p>
        </div>
        <LiveStatus polling={polling} stopped={false} />
      </header>

      <Hero overview={overview} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <SalesPerEvent events={events.data} />
        <div className="order-first flex flex-col gap-6 lg:order-none">
          <Comparison overview={overview} />
          <NextEvents events={upcoming} />
        </div>
      </div>
    </div>
  );
}

function Hero({ overview }: { overview: Overview }) {
  const { quota, sold, reserved, remaining, revenue, byKind } = overview;
  const ratio = quota > 0 ? sold / quota : 0;
  return (
    <section
      aria-labelledby="hero-title"
      className="rise grid gap-8 rounded-card bg-inkblue p-6 text-canvas sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center"
      style={stagger(1)}
    >
      <div className="flex flex-col gap-6">
        <div>
          <h2 id="hero-title" className="text-body text-blue-mist">
            Tiket terjual di semua event
          </h2>
          <p className="mt-2 text-hero font-bold leading-none tabular-nums">
            <CountUp value={sold} />
          </p>
          <p className="mt-3 text-body text-blue-mist">
            dari {formatCount(quota)} kursi, {formatPercent(ratio)} terisi
          </p>
        </div>
        <dl className="grid gap-3 sm:grid-cols-3">
          <HeroStat label="Pendapatan tiket lunas">
            <CountUp value={revenue} format={rupiah} />
          </HeroStat>
          <HeroStat label="Sedang ditahan">
            <CountUp value={reserved} />
          </HeroStat>
          <HeroStat label="Kursi tersisa">
            <CountUp value={remaining} />
          </HeroStat>
        </dl>
      </div>

      <SoldRing className="size-44" quota={quota} regular={byKind.REGULAR.sold} vip={byKind.VIP.sold} />
    </section>
  );
}

function Comparison({ overview }: { overview: Overview }) {
  return (
    <section aria-labelledby="compare-title" className={card} style={stagger(2)}>
      <h2 id="compare-title" className="text-lead font-bold text-ink">
        Reguler dibanding VIP
      </h2>
      <p className="mt-1 text-small text-quiet">Terjual terhadap kuota, di semua event.</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        {KINDS.map((kind) => (
          <KindBlock key={kind} kind={kind} totals={overview.byKind[kind]} totalRevenue={overview.revenue} />
        ))}
      </div>
    </section>
  );
}

function KindBlock({ kind, totals, totalRevenue }: { kind: TicketKind; totals: Totals; totalRevenue: number }) {
  const style = KIND_STYLE[kind];
  const share = totalRevenue > 0 ? totals.revenue / totalRevenue : 0;
  return (
    <div className={`rounded-chip p-5 ${style.tint}`}>
      <h3 className="text-small font-bold text-ink">{kindLabel(kind)}</h3>
      <p className="mt-3 text-figure font-bold leading-none tabular-nums text-ink">
        <CountUp value={totals.sold} />
      </p>
      <p className="mt-1 text-caption text-graphite">terjual dari {formatCount(totals.quota)} kursi</p>
      <div className="mt-4">
        <Bar
          value={totals.sold}
          max={totals.quota}
          label={`${kindLabel(kind)} terjual`}
          fillClassName={style.fill}
          trackClassName="bg-canvas"
        />
      </div>
      <dl className="mt-4 flex flex-col gap-1 text-caption text-graphite">
        <div className="flex justify-between gap-3">
          <dt>Pendapatan</dt>
          <dd className="font-bold text-ink">{rupiah(totals.revenue)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Porsi pendapatan</dt>
          <dd className="font-bold text-ink">{formatPercent(share)}</dd>
        </div>
      </dl>
    </div>
  );
}

function SalesPerEvent({ events }: { events: OrganizerEvent[] }) {
  return (
    <section aria-labelledby="events-title" className={card} style={stagger(3)}>
      <h2 id="events-title" className="text-lead font-bold text-ink">
        Penjualan per event
      </h2>
      <p className="mt-1 text-small text-quiet">Reguler dan VIP berdampingan, terjual terhadap kuota masing-masing.</p>
      <ul className="mt-4 flex flex-col">
        {events.map((event) => (
          <li key={event.id} className="border-t border-mist first:border-t-0">
            <Link
              to={`/organizer/event/${event.id}`}
              className="soft -mx-3 flex flex-col gap-3 rounded-chip px-3 py-4 hover:bg-field"
            >
              <span className="flex flex-wrap items-baseline justify-between gap-x-4">
                <span className="font-bold text-ink">{event.title}</span>
                <span className="text-caption text-graphite">{formatDateTime(event.startsAt)}</span>
              </span>
              {KINDS.map((kind) => {
                const type = event.ticketTypes.find((t) => t.kind === kind);
                if (!type) return null;
                return (
                  <span key={kind} className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-3 text-caption">
                    <span className="text-graphite">{kindLabel(kind)}</span>
                    <Bar
                      value={type.sold}
                      max={type.quota}
                      label={`${kindLabel(kind)}, ${event.title}`}
                      fillClassName={KIND_STYLE[kind].fill}
                      trackClassName={KIND_STYLE[kind].track}
                    />
                    <span className="min-w-20 text-right tabular-nums text-ink">
                      {formatCount(type.sold)} / {formatCount(type.quota)}
                    </span>
                  </span>
                );
              })}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function NextEvents({ events }: { events: OrganizerEvent[] }) {
  return (
    <section aria-labelledby="next-title" className={card} style={stagger(4)}>
      <h2 id="next-title" className="text-lead font-bold text-ink">
        Event berikutnya
      </h2>
      {events.length === 0 ? (
        <p className="mt-3 text-small text-quiet">Semua event sudah dimulai. Buat event baru untuk membuka penjualan lagi.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {events.map((event) => {
            const { day, month } = formatDayMonth(event.startsAt);
            const left = event.ticketTypes.reduce((n, t) => n + t.remaining, 0);
            return (
              <li key={event.id}>
                <Link
                  to={`/organizer/event/${event.id}`}
                  className="soft -mx-3 flex items-center gap-4 rounded-chip px-3 py-2 hover:bg-field"
                >
                  <span
                    aria-hidden="true"
                    className="flex size-14 shrink-0 flex-col items-center justify-center rounded-chip bg-clay text-ink"
                  >
                    <span className="text-lead font-bold leading-none">{day}</span>
                    <span className="text-caption">{month}</span>
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-bold text-ink">{event.title}</span>
                    <span className="block truncate text-caption text-graphite">
                      {event.venue}, sisa {formatCount(left)} kursi
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function OverviewLoading() {
  return (
    <div role="status" aria-label="Memuat ringkasan" className="flex flex-col gap-6">
      <div className="h-14 w-72 animate-pulse rounded-chip bg-wall" />
      <div className="h-64 animate-pulse rounded-card bg-wall" />
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="h-96 animate-pulse rounded-card bg-wall" />
        <div className="h-96 animate-pulse rounded-card bg-wall" />
      </div>
    </div>
  );
}
