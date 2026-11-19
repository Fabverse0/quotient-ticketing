import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { ApiError, messageFor } from "../api/errors";
import { cancelOrder, getOrder, payOrder, type OrderDetail } from "../api/orders";
import { Button } from "../components/Button";
import { DottedList } from "../components/DottedList";
import { OrderStatus } from "../components/OrderStatus";
import { PageLoading, PageMessage } from "../components/PageState";
import { useServerNow } from "../hooks/useServerNow";
import { useShake } from "../hooks/useShake";
import { formatCountdown, formatDateTime, formatRupiah, kindLabel } from "../lib/format";

export function OrderPage() {
  const { id = "" } = useParams();
  const order = useQuery({ queryKey: ["order", id], queryFn: () => getOrder(id) });

  if (order.isPending) return <PageLoading />;
  if (order.isError) {
    const missing = order.error instanceof ApiError && (order.error.status === 404 || order.error.status === 400);
    return (
      <PageMessage action={missing ? undefined : { label: "Muat ulang pesanan", onClick: () => void order.refetch() }}>
        {missing ? "Pesanan ini tidak ditemukan." : messageFor(order.error)}
      </PageMessage>
    );
  }
  return <OrderView order={order.data} />;
}

// The simulated pay route only exists outside production.
const payMessage = (error: unknown) =>
  error instanceof ApiError && error.code === "NOT_FOUND"
    ? "Pembayaran simulasi hanya tersedia di mode development."
    : messageFor(error);

function OrderView({ order }: { order: OrderDetail }) {
  const queryClient = useQueryClient();
  const { ref, shake } = useShake<HTMLElement>();
  const pending = order.status === "PENDING";
  const now = useServerNow(pending);
  const left = new Date(order.expiresAt).getTime() - now;
  const expired = pending && left <= 0;

  const refresh = (updated?: OrderDetail) => {
    if (updated) queryClient.setQueryData(["order", order.id], updated);
    else void queryClient.invalidateQueries({ queryKey: ["order", order.id] });
    void queryClient.invalidateQueries({ queryKey: ["orders"] });
    void queryClient.invalidateQueries({ queryKey: ["tickets"] });
    void queryClient.invalidateQueries({ queryKey: ["events"] });
  };

  const pay = useMutation({
    mutationFn: () => payOrder(order.id),
    onSuccess: (paid) => refresh(paid),
    onError: () => {
      shake();
      refresh();
    },
  });
  const cancel = useMutation({
    mutationFn: () => cancelOrder(order.id),
    onSuccess: () => refresh(),
    onError: () => {
      shake();
      refresh();
    },
  });
  const failure = pay.error ? payMessage(pay.error) : cancel.error ? messageFor(cancel.error) : undefined;

  return (
    <section ref={ref} className="mx-auto flex max-w-(--width-form) flex-col gap-8 py-12">
      <div className="flex flex-col gap-2">
        <p className="text-label uppercase tracking-label text-quiet">Pesanan {order.id.slice(0, 6).toUpperCase()}</p>
        <h1 className="font-display text-title text-ink">{order.event.title}</h1>
        <p className="text-small text-quiet">{formatDateTime(order.event.startsAt)}</p>
      </div>

      <div className="flex flex-col items-center gap-3 rounded-ui bg-wall px-6 py-10 text-center">
        <OrderStatus status={order.status} expired={expired} />
        {pending && !expired && (
          <>
            <p className="font-display text-figure leading-none text-ink" aria-hidden="true">
              {formatCountdown(left)}
            </p>
            <p className="text-caption text-quiet">
              Bayar sebelum {formatDateTime(order.expiresAt)}. Setelah itu kursi dilepas.
            </p>
          </>
        )}
        {expired && (
          <p role="status" className="text-small text-oxblood">
            Waktu bayar habis. Kursi sudah dilepas untuk pembeli lain.
          </p>
        )}
        {order.status === "PAID" && (
          <p className="text-small text-graphite">
            Dibayar {order.paidAt && formatDateTime(order.paidAt)}.{" "}
            <Link to="/tiket" className="link-underline text-ink">
              Lihat tiket
            </Link>
          </p>
        )}
        {order.status === "CANCELLED" && <p className="text-small text-graphite">Pesanan dibatalkan, kursi sudah dilepas.</p>}
        {order.status === "REFUND_REQUIRED" && (
          <p className="text-small text-graphite">Pembayaran datang setelah waktu bayar habis. Dana akan dikembalikan.</p>
        )}
      </div>

      <DottedList
        rows={[
          { label: `${kindLabel(order.ticketType.kind)} × ${order.quantity}`, value: formatRupiah(order.totalPrice) },
          { label: "Dipesan", value: formatDateTime(order.createdAt), muted: true },
        ]}
      />

      {failure && (
        <p role="alert" className="text-small text-oxblood">
          {failure}
        </p>
      )}

      {pending && !expired && (
        <div className="flex flex-col items-center gap-3">
          <Button className="w-full" onClick={() => pay.mutate()} busy={pay.isPending} disabled={cancel.isPending}>
            {pay.isPending ? "Membayar" : "Bayar sekarang"}
          </Button>
          <button
            type="button"
            onClick={() => cancel.mutate()}
            disabled={pay.isPending || cancel.isPending}
            className="inline-flex min-h-(--size-button) items-center text-small text-quiet hover:text-ink disabled:opacity-60"
          >
            <span className="link-underline">{cancel.isPending ? "Membatalkan" : "Batalkan pesanan"}</span>
          </button>
        </div>
      )}

      <Link to="/pesanan" className="self-start text-small text-quiet">
        <span className="link-underline">Semua pesanan</span>
      </Link>
    </section>
  );
}
