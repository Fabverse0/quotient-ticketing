import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { messageFor } from "../api/errors";
import { listOrders, type Order } from "../api/orders";
import { OrderStatus } from "../components/OrderStatus";
import { PageMessage } from "../components/PageState";
import { useServerNow } from "../hooks/useServerNow";
import { formatCountdown, formatDateTime, formatDayMonth, formatRupiah, kindLabel } from "../lib/format";
import { stagger } from "../lib/stagger";

function CardsLoading() {
  return (
    <ul role="status" aria-label="Memuat" className="flex flex-col gap-4">
      {[0, 1, 2].map((i) => (
        <li key={i} className="h-28 animate-pulse rounded-ui bg-wall" />
      ))}
    </ul>
  );
}

// One order as a ticket stub: the event date on the left, a torn edge, then the order.
function OrderCard({ order, now }: { order: Order; now: number }) {
  const { day, month } = formatDayMonth(order.event.startsAt);
  const msLeft = new Date(order.expiresAt).getTime() - now;
  const awaitingPayment = order.status === "PENDING" && msLeft > 0;
  return (
    <Link
      to={`/pesanan/${order.id}`}
      className="soft flex gap-5 rounded-ui bg-wall p-4 hover:bg-field sm:gap-6 sm:p-5"
    >
      <span aria-hidden="true" className="flex shrink-0 flex-col items-center justify-center gap-1 sm:w-20">
        <span className="rounded-ui border border-ink p-0.5">
          <span className="flex size-14 flex-col items-center justify-center rounded-cover border border-ink">
            <span className="font-display text-title leading-none text-ink">{day}</span>
            <span className="text-caption text-quiet">{month}</span>
          </span>
        </span>
        <span className="text-label uppercase tracking-label text-quiet">Mulai</span>
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-3 border-l border-dashed border-ash pl-5 sm:pl-6">
        <span className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <span className="min-w-0">
            <span className="block truncate font-display text-lead text-ink">{order.event.title}</span>
            <span className="block text-small text-quiet">Dipesan {formatDateTime(order.createdAt)}</span>
          </span>
          <OrderStatus status={order.status} expired={msLeft <= 0} />
        </span>
        <span className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
          <span className="text-body text-ink">
            {order.quantity} × {kindLabel(order.ticketType.kind)}
            {awaitingPayment && (
              <span className="ml-3 text-small text-ochre-text">Bayar dalam {formatCountdown(msLeft)}</span>
            )}
          </span>
          <span className="font-bold tabular-nums text-ink">{formatRupiah(order.totalPrice)}</span>
        </span>
      </span>
    </Link>
  );
}

export function OrdersPage() {
  const orders = useQuery({ queryKey: ["orders"], queryFn: listOrders });
  // Ticks only while a PENDING row could still run out, so it reads Kedaluwarsa on time.
  const now = useServerNow(Boolean(orders.data?.some((o) => o.status === "PENDING")));
  const paid = orders.data?.filter((o) => o.status === "PAID").length ?? 0;

  return (
    <section className="py-12">
      <h1 className="font-display text-title text-ink">Pesanan</h1>
      {orders.data && orders.data.length > 0 && (
        <p className="mt-2 text-small text-quiet">
          {orders.data.length} pesanan, {paid} sudah lunas.
        </p>
      )}
      <div className="mt-8">
        {orders.isPending && <CardsLoading />}
        {orders.isError && (
          <PageMessage action={{ label: "Muat ulang pesanan", onClick: () => void orders.refetch() }}>
            {messageFor(orders.error)}
          </PageMessage>
        )}
        {orders.data?.length === 0 && (
          <PageMessage ornament>
            Belum ada pesanan.{" "}
            <Link to="/" className="link-underline text-ink">
              Lihat event
            </Link>
          </PageMessage>
        )}
        {orders.data && orders.data.length > 0 && (
          <ul className="flex flex-col gap-4">
            {orders.data.map((order, i) => (
              <li key={order.id} className="rise" style={stagger(i)}>
                <OrderCard order={order} now={now} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
