import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router";
import { ApiError, messageFor } from "../api/errors";
import type { TicketKind } from "../api/events";
import type { OrderStatus as Status } from "../api/orders";
import {
  getAnalytics,
  getMyEvent,
  listMyEvents,
  recentOrders,
  type EventAnalytics,
  type OrganizerEvent,
  type OrganizerTicketType,
} from "../api/organizer";
import { Bar } from "../components/Bar";
import { CountUp } from "../components/CountUp";
import { InvariantPanel } from "../components/InvariantPanel";
import { LiveStatus } from "../components/LiveStatus";
import { OrderStatus } from "../components/OrderStatus";
import { PageLoading, PageMessage } from "../components/PageState";
import { HeroStat } from "../components/HeroStat";
import { SoldRing } from "../components/SoldRing";
import { SalesChart } from "../components/SalesChart";
import { SeatMap } from "../components/SeatMap";
import { POLL_MS } from "../hooks/useLiveStream";
import { useOrganizerStream } from "../hooks/useOrganizerStream";
import { formatCount, formatDateTime, formatPercent, formatRupiah, kindLabel } from "../lib/format";
import { KIND_STYLE } from "../lib/kindStyle";
import { serverNow } from "../lib/serverClock";
import { stagger } from "../lib/stagger";

const card = "rise rounded-card bg-wall p-6";

export function AnalyticsPage() {
  const { id = "" } = useParams();
  const event = useQuery({ queryKey: ["organizer-event", id], queryFn: () => getMyEvent(id) });

  if (event.isPending) return <PageLoading />;
  if (event.isError) {
    const status = event.error instanceof ApiError ? event.error.status : 0;
    const text =
      status === 403 ? "Event ini milik organizer lain." : status === 404 || status === 400 ? "Event ini tidak ditemukan." : messageFor(event.error);
    return (
      <PageMessage action={status ? undefined : { label: "Muat ulang analitik", onClick: () => void event.refetch() }}>
        {text}
      </PageMessage>
    );
  }
  return <Analytics event={event.data} />;
}

function Analytics({ event }: { event: OrganizerEvent }) {
  const { polling, stoppedBy } = useOrganizerStream(event.id);
  // A second observer of the page's query, so it polls only while the stream is down.
  useQuery({
    queryKey: ["organizer-event", event.id],
    queryFn: () => getMyEvent(event.id),
    refetchInterval: polling ? POLL_MS : false,
  });

  return (
    <div className="flex flex-col gap-6">
      <header className="rise flex flex-wrap items-end justify-between gap-4" style={stagger(0)}>
        <div>
          <h1 className="text-title font-bold text-ink">Analitik</h1>
          <p className="mt-1 text-small text-quiet">Penjualan, kursi, dan kecocokan data untuk satu event.</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <LiveStatus polling={polling} stopped={Boolean(stoppedBy)} />
          <EventPicker currentId={event.id} />
        </div>
      </header>
      {stoppedBy && (
        <p role="alert" className="text-small text-oxblood">
          Angka di halaman ini tidak diperbarui lagi. {messageFor(stoppedBy)}
        </p>
      )}

      <EventHero event={event} />

      <div className="grid gap-6 lg:grid-cols-2">
        {event.ticketTypes.map((type, i) => (
          <KindCard key={type.id} type={type} index={2 + i} />
        ))}
      </div>

      <Trends eventId={event.id} polling={polling} />

      <div className="grid gap-6 lg:grid-cols-2">
        <InvariantPanel key={event.id} eventId={event.id} />
        <OrdersPanel eventId={event.id} polling={polling} />
      </div>
    </div>
  );
}

// A native select: keyboard, screen readers and phones already know how to use it.
function EventPicker({ currentId }: { currentId: string }) {
  const navigate = useNavigate();
  const events = useQuery({ queryKey: ["organizer-events"], queryFn: listMyEvents });
  if (!events.data || events.data.length < 2) return null;
  return (
    <label className="flex items-center gap-3 text-small text-quiet">
      <span>Event</span>
      <span className="relative">
        <select
          value={currentId}
          onChange={(e) => navigate(`/organizer/event/${e.target.value}`)}
          className="h-(--size-button) max-w-64 appearance-none truncate rounded-chip border border-mist bg-wall py-0 pl-4 pr-10 text-body text-ink"
        >
          {events.data.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title}
            </option>
          ))}
        </select>
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-quiet"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </span>
    </label>
  );
}

function EventHero({ event }: { event: OrganizerEvent }) {
  const sum = (pick: (t: OrganizerTicketType) => number) => event.ticketTypes.reduce((n, t) => n + pick(t), 0);
  const quota = sum((t) => t.quota);
  const sold = sum((t) => t.sold);
  const reserved = sum((t) => t.reserved);
  const revenue = sum((t) => t.sold * t.price);
  const soldOf = (kind: TicketKind) => event.ticketTypes.find((t) => t.kind === kind)?.sold ?? 0;

  return (
    <section
      aria-labelledby="event-title"
      className="rise grid gap-8 rounded-card bg-inkblue p-6 text-canvas sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center"
      style={stagger(1)}
    >
      <div className="flex flex-col gap-6">
        <div>
          <h2 id="event-title" className="text-title font-bold text-balance break-words">
            {event.title}
          </h2>
          <p className="mt-2 text-body text-blue-mist">{formatDateTime(event.startsAt)}</p>
          <p className="text-body text-blue-mist">{event.venue}</p>
        </div>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <HeroStat label="Terjual">
            <CountUp value={sold} />
          </HeroStat>
          <HeroStat label="Sedang ditahan">
            <CountUp value={reserved} />
          </HeroStat>
          <HeroStat label="Kursi tersisa">
            <CountUp value={quota - sold - reserved} />
          </HeroStat>
          <HeroStat label="Pendapatan">
            <CountUp value={revenue} format={(n) => formatRupiah(Math.round(n))} />
          </HeroStat>
        </dl>
      </div>
      <SoldRing className="size-40" quota={quota} regular={soldOf("REGULAR")} vip={soldOf("VIP")} />
    </section>
  );
}

function KindCard({ type, index }: { type: OrganizerTicketType; index: number }) {
  const style = KIND_STYLE[type.kind];
  return (
    <section aria-labelledby={`kind-${type.kind}`} className={`rise flex flex-col gap-5 rounded-card p-6 ${style.tint}`} style={stagger(index)}>
      <div className="flex items-baseline justify-between gap-4">
        <h2 id={`kind-${type.kind}`} className="text-lead font-bold text-ink">
          {kindLabel(type.kind)}
        </h2>
        <span className="text-small text-graphite">{formatRupiah(type.price)} per tiket</span>
      </div>
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Figure label="Kuota" value={type.quota} />
        <Figure label="Terjual" value={type.sold} />
        <Figure label="Ditahan" value={type.reserved} />
        <Figure label="Sisa" value={type.remaining} />
      </dl>
      <Bar
        value={type.sold}
        max={type.quota}
        label={`${kindLabel(type.kind)} terjual`}
        fillClassName={style.fill}
        trackClassName="bg-canvas"
      />
      <SeatMap quota={type.quota} sold={type.sold} reserved={type.reserved} size="large" />
    </section>
  );
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-caption text-graphite">{label}</dt>
      <dd className="mt-1 text-title font-bold leading-none tabular-nums text-ink">
        <CountUp value={value} />
      </dd>
    </div>
  );
}

function OrdersPanel({ eventId, polling }: { eventId: string; polling: boolean }) {
  const orders = useQuery({
    queryKey: ["organizer-orders", eventId],
    queryFn: () => recentOrders(eventId),
    refetchInterval: polling ? POLL_MS : false,
  });

  return (
    <section aria-labelledby="orders-title" className={`${card} flex flex-col gap-4`} style={stagger(7)}>
      <h2 id="orders-title" className="text-lead font-bold text-ink">
        Pesanan terbaru
      </h2>
      {orders.isPending && <div role="status" aria-label="Memuat" className="h-32 animate-pulse rounded-chip bg-canvas" />}
      {orders.isError && <p className="text-small text-oxblood">{messageFor(orders.error)}</p>}
      {orders.data?.length === 0 && (
        <p className="text-small text-quiet">
          Belum ada pesanan untuk event ini. Pesanan baru muncul di sini begitu masuk.
        </p>
      )}
      {orders.data && orders.data.length > 0 && (
        <ul className="flex flex-col">
          {orders.data.map((order) => (
            <li key={order.id} className="grid gap-1 border-t border-mist py-3 first:border-t-0 first:pt-0 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-4">
              <span>
                <span className="block text-ink">{order.buyerName}</span>
                <span className="text-caption text-quiet">
                  {order.quantity} × {kindLabel(order.ticketType.kind)}, {formatDateTime(order.createdAt)}
                </span>
              </span>
              <span className="justify-self-start">
                <OrderStatus status={order.status} expired={new Date(order.expiresAt).getTime() <= serverNow()} />
              </span>
            </li>
          ))}
        </ul>
      )}
      <Link to="/organizer/event" className="soft mt-1 self-start text-small text-quiet underline-offset-4 hover:text-ink">
        Semua event
      </Link>
    </section>
  );
}

const STATUS: Record<Status, { label: string; fill: string }> = {
  PENDING: { label: "Menunggu bayar", fill: "bg-ochre" },
  PAID: { label: "Lunas", fill: "bg-inkblue" },
  CANCELLED: { label: "Dibatalkan", fill: "bg-slate" },
  EXPIRED: { label: "Kedaluwarsa", fill: "bg-oxblood" },
  REFUND_REQUIRED: { label: "Perlu refund", fill: "bg-ink" },
};

function Trends({ eventId, polling }: { eventId: string; polling: boolean }) {
  const analytics = useQuery({
    queryKey: ["organizer-analytics", eventId],
    queryFn: () => getAnalytics(eventId),
    refetchInterval: polling ? POLL_MS : false,
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <section aria-labelledby="sales-title" className={card} style={stagger(4)}>
        <h2 id="sales-title" className="text-lead font-bold text-ink">
          Tiket terjual dari waktu ke waktu
        </h2>
        <p className="mt-1 text-small text-quiet">Tiket yang terbayar di tiap periode, Reguler dan VIP berdampingan.</p>
        <div className="mt-5">
          {analytics.isPending && <div role="status" aria-label="Memuat" className="h-56 animate-pulse rounded-chip bg-canvas" />}
          {analytics.isError && <p className="text-small text-oxblood">{messageFor(analytics.error)}</p>}
          {analytics.data && analytics.data.sales.length === 0 && (
            <p className="text-small text-quiet">Belum ada pesanan lunas. Garis akan muncul di sini begitu ada tiket yang terbayar.</p>
          )}
          {analytics.data && analytics.data.sales.length > 0 && <SalesChart sales={analytics.data.sales} />}
        </div>
      </section>

      <section aria-labelledby="status-title" className={card} style={stagger(5)}>
        <h2 id="status-title" className="text-lead font-bold text-ink">
          Status pesanan
        </h2>
        {analytics.data ? <StatusBars data={analytics.data} /> : <p className="mt-3 text-small text-quiet">Memuat status pesanan.</p>}
      </section>
    </div>
  );
}

function StatusBars({ data }: { data: EventAnalytics }) {
  const orders = data.statuses.reduce((n, s) => n + s.orders, 0);
  const paid = data.statuses.find((s) => s.status === "PAID")?.orders ?? 0;
  return (
    <>
      <p className="mt-1 text-small text-quiet">
        {orders === 0
          ? "Belum ada pesanan."
          : `${formatCount(paid)} dari ${formatCount(orders)} pesanan lunas (${formatPercent(paid / orders)}).`}
      </p>
      <ul className="mt-5 flex flex-col gap-4">
        {data.statuses.map((s) => (
          <li key={s.status} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3 text-small">
              <span className="text-ink">{STATUS[s.status].label}</span>
              <span className="tabular-nums text-graphite">
                {formatCount(s.orders)} pesanan, {formatCount(s.quantity)} kursi
              </span>
            </div>
            <Bar value={s.orders} max={orders} label={STATUS[s.status].label} fillClassName={STATUS[s.status].fill} trackClassName="bg-canvas" />
          </li>
        ))}
      </ul>
    </>
  );
}
