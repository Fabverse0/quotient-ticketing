import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { messageFor } from "../api/errors";
import { listOrders } from "../api/orders";
import { OrderStatus } from "../components/OrderStatus";
import { PageMessage } from "../components/PageState";
import { useServerNow } from "../hooks/useServerNow";
import { formatDateTime, kindLabel } from "../lib/format";

function RowsLoading() {
  return (
    <ul role="status" aria-label="Memuat" className="flex flex-col">
      {[0, 1, 2].map((i) => (
        <li key={i} className="h-16 animate-pulse border-b border-mist bg-wall/60" />
      ))}
    </ul>
  );
}

// Rows with thin rules, not cards (DESIGN.md).
export function OrdersPage() {
  const orders = useQuery({ queryKey: ["orders"], queryFn: listOrders });
  // Ticks only while a PENDING row could still run out, so it reads Kedaluwarsa on time.
  const now = useServerNow(Boolean(orders.data?.some((o) => o.status === "PENDING")));

  return (
    <section className="py-12">
      <h1 className="mb-8 font-display text-title text-ink">Pesanan</h1>
      {orders.isPending && <RowsLoading />}
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
        <ul className="flex flex-col border-t border-mist">
          {orders.data.map((order) => (
            <li key={order.id} className="border-b border-mist">
              <Link
                to={`/pesanan/${order.id}`}
                className="grid gap-1 py-4 hover:bg-wash sm:grid-cols-[1fr_auto_auto] sm:items-center sm:gap-6 sm:px-2"
              >
                <span className="text-ink">{order.event.title}</span>
                <span className="text-small text-quiet">
                  {order.quantity} × {kindLabel(order.ticketType.kind)} · {formatDateTime(order.createdAt)}
                </span>
                <span>
                  <OrderStatus status={order.status} expired={new Date(order.expiresAt).getTime() <= now} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
