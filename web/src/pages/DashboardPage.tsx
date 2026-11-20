import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { ApiError, messageFor } from "../api/errors";
import { checkInvariants, getMyEvent, recentOrders, type InvariantReport, type OrganizerEvent } from "../api/organizer";
import { Button } from "../components/Button";
import { DottedList } from "../components/DottedList";
import { LiveNumber } from "../components/LiveNumber";
import { OrderStatus } from "../components/OrderStatus";
import { PageLoading, PageMessage } from "../components/PageState";
import { Reveal } from "../components/Reveal";
import { SeatMap } from "../components/SeatMap";
import { useShake } from "../hooks/useShake";
import { formatDateTime, formatRupiah, kindLabel } from "../lib/format";

// Plain polling for now; the realtime module replaces it with a live stream.
const REFRESH_MS = 10_000;

export function DashboardPage() {
  const { id = "" } = useParams();
  const event = useQuery({ queryKey: ["organizer-event", id], queryFn: () => getMyEvent(id), refetchInterval: REFRESH_MS });

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
  const type = event.ticketTypes[index] ?? event.ticketTypes[0]!;

  return (
    <section className="py-12">
      <Link to="/organizer" className="text-small text-quiet">
        <span className="link-underline">Semua event</span>
      </Link>
      <p className="mt-6 text-label uppercase tracking-label text-quiet">Dashboard organizer</p>
      <h1 className="mt-2 font-display text-title text-ink">{event.title}</h1>
      <p className="mt-1 text-small text-quiet">
        {formatDateTime(event.startsAt)} · {event.venue} · diperbarui tiap 10 detik
      </p>

      <div role="tablist" aria-label="Tipe tiket" className="mt-8 flex gap-6 border-b border-mist">
        {event.ticketTypes.map((t, i) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            id={`tab-${t.kind}`}
            aria-selected={i === index}
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

        <div className="grid gap-8 lg:grid-cols-2">
          <Reveal>
            <InvariantPanel eventId={event.id} />
          </Reveal>
          <Reveal index={1}>
            <OrdersPanel eventId={event.id} />
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
  const check = useMutation({
    mutationFn: () => checkInvariants(eventId),
    onSuccess: (report: InvariantReport) => {
      if (!report.ok) shake();
    },
    onError: shake,
  });
  const report = check.data;

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

function OrdersPanel({ eventId }: { eventId: string }) {
  const orders = useQuery({ queryKey: ["organizer-orders", eventId], queryFn: () => recentOrders(eventId), refetchInterval: REFRESH_MS });

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
              <OrderStatus status={order.status} expired={new Date(order.expiresAt).getTime() <= Date.now()} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
