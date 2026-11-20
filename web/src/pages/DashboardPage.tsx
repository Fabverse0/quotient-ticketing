import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { ApiError, messageFor } from "../api/errors";
import { checkInvariants, getMyEvent, recentOrders, type InvariantReport, type OrganizerEvent } from "../api/organizer";
import { Button } from "../components/Button";
import { DottedList } from "../components/DottedList";
import { LiveNumber } from "../components/LiveNumber";
import { LiveStatus } from "../components/LiveStatus";
import { OrderStatus } from "../components/OrderStatus";
import { PageLoading, PageMessage } from "../components/PageState";
import { Reveal } from "../components/Reveal";
import { SeatMap } from "../components/SeatMap";
import { POLL_MS } from "../hooks/useLiveStream";
import { useOrganizerStream } from "../hooks/useOrganizerStream";
import { useShake } from "../hooks/useShake";
import { formatCount, formatDateTime, formatRupiah, kindLabel } from "../lib/format";
import { serverNow } from "../lib/serverClock";

export function DashboardPage() {
  const { id = "" } = useParams();
  const event = useQuery({ queryKey: ["organizer-event", id], queryFn: () => getMyEvent(id) });

  if (event.isPending) return <PageLoading />;
  if (event.isError) {
    const status = event.error instanceof ApiError ? event.error.status : 0;
    const text =
      status === 403 ? "Event ini milik organizer lain." : status === 404 || status === 400 ? "Event ini tidak ditemukan." : messageFor(event.error);
    return (
      <PageMessage action={status ? undefined : { label: "Muat ulang dashboard", onClick: () => void event.refetch() }}>
        {text}
      </PageMessage>
    );
  }
  return <Dashboard event={event.data} />;
}

function Dashboard({ event }: { event: OrganizerEvent }) {
  const [index, setIndex] = useState(0);
  const { polling, stoppedBy } = useOrganizerStream(event.id);
  // A second observer of the page's query, so it polls only while the stream is down.
  useQuery({
    queryKey: ["organizer-event", event.id],
    queryFn: () => getMyEvent(event.id),
    refetchInterval: polling ? POLL_MS : false,
  });
  const type = event.ticketTypes[index] ?? event.ticketTypes[0]!;
  const capacity = event.ticketTypes.reduce((sum, t) => sum + t.quota, 0);

  return (
    <section className="py-12">
      <Link to="/organizer" className="inline-flex min-h-(--size-button) items-center text-small text-quiet">
        <span className="link-underline">Semua event</span>
      </Link>
      <header className="mt-4 rounded-ui border border-ink p-1">
        <div className="flex flex-col gap-8 rounded-cover border border-ink px-6 py-8 sm:px-10 sm:py-10">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
            <p className="text-label uppercase tracking-label text-quiet">
              Dashboard organizer · No. {event.id.slice(0, 6).toUpperCase()}
            </p>
            <LiveStatus polling={polling} stopped={Boolean(stoppedBy)} />
          </div>
          <h1 className="font-display text-title uppercase tracking-band text-balance break-words text-ink sm:text-band">
            {event.title}
          </h1>
          <dl className="grid gap-4 sm:grid-cols-3 sm:gap-8">
            {[
              { label: "Waktu", value: formatDateTime(event.startsAt) },
              { label: "Tempat", value: event.venue },
              { label: "Kapasitas", value: `${formatCount(capacity)} kursi · ${event.ticketTypes.map((t) => `${kindLabel(t.kind)} ${formatCount(t.quota)}`).join(" · ")}` },
            ].map((item) => (
              <div key={item.label} className="border-t border-mist pt-3">
                <dt className="text-label uppercase tracking-label text-quiet">{item.label}</dt>
                <dd className="mt-1 text-body text-ink">{item.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </header>
      {stoppedBy && (
        <p role="alert" className="mt-3 text-small text-oxblood">
          Angka di halaman ini tidak diperbarui lagi. {messageFor(stoppedBy)}
        </p>
      )}

      <div
        role="tablist"
        aria-label="Tipe tiket"
        className="mt-8 flex gap-6 border-b border-mist"
        onKeyDown={(e) => {
          // Arrow keys move between tabs and focus follows, as the tabs pattern expects.
          if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
          const count = event.ticketTypes.length;
          const next = (index + (e.key === "ArrowRight" ? 1 : count - 1)) % count;
          setIndex(next);
          e.currentTarget.querySelectorAll<HTMLElement>("[role=tab]")[next]?.focus();
        }}
      >
        {event.ticketTypes.map((t, i) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            id={`tab-${t.kind}`}
            aria-selected={i === index}
            tabIndex={i === index ? 0 : -1}
            aria-controls="tab-panel"
            onClick={() => setIndex(i)}
            className={`-mb-px inline-flex min-h-(--size-button) items-center border-b ${i === index ? "border-ink text-ink" : "border-transparent text-quiet hover:text-ink"}`}
          >
            {kindLabel(t.kind)} · {formatRupiah(t.price)}
          </button>
        ))}
      </div>

      <div id="tab-panel" role="tabpanel" aria-labelledby={`tab-${type.kind}`} className="mt-6 flex flex-col gap-8">
        <Reveal>
          <div className="flex flex-col gap-8 rounded-ui bg-wall p-6">
            <dl className="grid grid-cols-2 gap-6 sm:grid-cols-4">
              <Figure label="Kuota" value={type.quota} />
              <Figure label="Terjual" value={type.sold} />
              <Figure label="Ditahan" value={type.reserved} />
              <Figure label="Sisa" value={type.remaining} />
            </dl>
            <SeatMap quota={type.quota} sold={type.sold} reserved={type.reserved} size="large" />
          </div>
        </Reveal>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-2">
          <Reveal>
            <InvariantPanel eventId={event.id} />
          </Reveal>
          <Reveal index={1}>
            <OrdersPanel eventId={event.id} polling={polling} />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-label uppercase tracking-label text-quiet">{label}</dt>
      <dd className="mt-1 font-display text-figure leading-none text-ink">
        <LiveNumber value={value} />
      </dd>
    </div>
  );
}

function InvariantPanel({ eventId }: { eventId: string }) {
  const { ref, shake } = useShake<HTMLElement>();
  const check = useMutation({ mutationFn: () => checkInvariants(eventId) });
  const report: InvariantReport | undefined = check.data;
  const rejected = check.isError || (report !== undefined && !report.ok);

  // After the render that adds the red border: React rewrites className, which
  // would cancel a shake started earlier.
  useEffect(() => {
    if (rejected) shake();
  }, [rejected, check.submittedAt, shake]);

  return (
    <section
      ref={ref}
      aria-labelledby="invariant-title"
      className={`flex flex-col gap-5 rounded-ui bg-wall p-6 ${report && !report.ok ? "border border-oxblood" : ""}`}
    >
      <div className="flex items-center justify-between gap-4">
        <h2 id="invariant-title" className="font-display text-lead text-ink">
          Pemeriksaan invariant
        </h2>
        <Button variant="secondary" onClick={() => check.mutate()} busy={check.isPending}>
          {check.isPending ? "Memeriksa" : "Jalankan pemeriksaan"}
        </Button>
      </div>

      {!report && !check.isError && (
        <p className="text-small text-quiet">
          Membandingkan counter kuota dengan pesanan dan tiket yang tercatat untuk event ini.
        </p>
      )}
      {check.isError && (
        <p role="alert" className="text-small text-oxblood">
          {messageFor(check.error)}
        </p>
      )}
      {report && (
        <>
          <DottedList
            rows={report.checks.map((c) => ({
              label: <span className={c.ok ? "" : "text-oxblood"}>{c.description}</span>,
              value: (
                <span className={`font-normal ${c.ok ? "text-sage" : "text-oxblood"}`}>
                  {Object.values(c.values).join(" / ")}
                </span>
              ),
            }))}
          />
          <p role="status" className={`text-small ${report.ok ? "text-sage" : "text-oxblood"}`}>
            {report.ok
              ? "Semua cocok."
              : `${report.checks.filter((c) => !c.ok).length} pemeriksaan dilanggar. Lihat baris berwarna merah.`}
          </p>
        </>
      )}
    </section>
  );
}

function OrdersPanel({ eventId, polling }: { eventId: string; polling: boolean }) {
  const orders = useQuery({
    queryKey: ["organizer-orders", eventId],
    queryFn: () => recentOrders(eventId),
    refetchInterval: polling ? POLL_MS : false,
  });

  return (
    <section aria-labelledby="orders-title" className="flex flex-col gap-4 rounded-ui bg-wall p-6">
      <h2 id="orders-title" className="font-display text-lead text-ink">
        Pesanan terbaru
      </h2>
      {orders.isPending && <div role="status" aria-label="Memuat" className="h-32 animate-pulse rounded-ui bg-canvas" />}
      {orders.isError && <p className="text-small text-oxblood">{messageFor(orders.error)}</p>}
      {orders.data?.length === 0 && <p className="text-small text-quiet">Belum ada pesanan untuk event ini.</p>}
      {orders.data && orders.data.length > 0 && (
        <ul className="flex flex-col">
          {orders.data.map((order) => (
            <li key={order.id} className="grid gap-1 border-t border-mist py-3 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-4">
              <span>
                <span className="block text-ink">{order.buyerName}</span>
                <span className="text-caption text-quiet">
                  {order.quantity} × {kindLabel(order.ticketType.kind)} · {formatDateTime(order.createdAt)}
                </span>
              </span>
              <span className="justify-self-start">
                <OrderStatus status={order.status} expired={new Date(order.expiresAt).getTime() <= serverNow()} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
