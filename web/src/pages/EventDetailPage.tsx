import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { ApiError, messageFor } from "../api/errors";
import { getEvent, type PublicEvent, type PublicTicketType } from "../api/events";
import { placeOrder } from "../api/orders";
import { useSession } from "../auth/session";
import { Button } from "../components/Button";
import { DoseSelector } from "../components/DoseSelector";
import { LiveNumber } from "../components/LiveNumber";
import { PageLoading, PageMessage } from "../components/PageState";
import { Reveal } from "../components/Reveal";
import { SeatMap } from "../components/SeatMap";
import { useHasPassed } from "../hooks/useHasPassed";
import { POLL_MS } from "../hooks/useLiveStream";
import { usePublicQuota } from "../hooks/usePublicQuota";
import { useShake } from "../hooks/useShake";
import { formatCount, formatDateTime, formatRupiah, kindLabel } from "../lib/format";

const MAX_PER_ORDER = 4;

// A lost answer (network, 503) may still have created the order, so the retry
// must carry the same Idempotency-Key. Any definite answer ends the attempt.
const isLostAnswer = (error: unknown) =>
  error instanceof ApiError && (error.code === "NETWORK" || error.code === "DATABASE_BUSY");

export function EventDetailPage() {
  const { id = "" } = useParams();
  const polling = usePublicQuota();
  const event = useQuery({ queryKey: ["event", id], queryFn: () => getEvent(id), refetchInterval: polling ? POLL_MS : false });

  if (event.isPending) return <PageLoading />;
  if (event.isError) {
    const missing = event.error instanceof ApiError && (event.error.status === 404 || event.error.status === 400);
    return (
      <PageMessage action={missing ? undefined : { label: "Muat ulang event", onClick: () => void event.refetch() }}>
        {missing ? "Event ini tidak ditemukan." : messageFor(event.error)}
      </PageMessage>
    );
  }
  return <EventDetail event={event.data} />;
}

function EventDetail({ event }: { event: PublicEvent }) {
  const firstOpen = event.ticketTypes.find((t) => t.remaining > 0) ?? event.ticketTypes[0]!;
  const [typeId, setTypeId] = useState(firstOpen.id);
  const type = event.ticketTypes.find((t) => t.id === typeId) ?? firstOpen;
  const taken = type.quota - type.remaining;

  return (
    <article className="pb-8">
      <header className="-mx-4 bg-carbon px-4 py-14 text-center sm:-mx-8 sm:rounded-ui sm:px-8">
        <p className="text-label uppercase tracking-label text-ash">{formatDateTime(event.startsAt)}</p>
        <h1 className="mt-3 font-display text-band uppercase tracking-band text-canvas">{event.title}</h1>
        <p className="mt-2 text-small text-mist">{event.venue}</p>
      </header>

      <div className="mx-auto mt-12 grid max-w-(--width-detail) gap-12 md:grid-cols-2">
        <Reveal>
          <section aria-labelledby="seats-title" className="flex flex-col gap-6">
            <div className="rounded-ui border border-ink p-1">
              <div className="flex flex-col items-center gap-1 rounded-cover border border-ink px-6 py-6 text-center">
                <h2 id="seats-title" className="text-label uppercase tracking-label text-quiet">
                  Sisa kursi {kindLabel(type.kind)}
                </h2>
                <p className="font-display text-figure leading-none text-ink">
                  <LiveNumber value={type.remaining} />
                </p>
                <p className="text-caption text-quiet">dari {formatCount(type.quota)} kursi</p>
              </div>
            </div>
            <SeatMap quota={type.quota} taken={taken} />
          </section>
        </Reveal>

        <Reveal index={1}>
          <OrderPanel event={event} type={type} onTypeChange={setTypeId} />
        </Reveal>
      </div>

      {event.description && (
        <p className="mx-auto mt-16 max-w-(--width-lead) whitespace-pre-line text-graphite">{event.description}</p>
      )}
    </article>
  );
}

function OrderPanel({
  event,
  type,
  onTypeChange,
}: {
  event: PublicEvent;
  type: PublicTicketType;
  onTypeChange: (id: string) => void;
}) {
  const { user } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { ref, shake } = useShake<HTMLDivElement>();
  const [quantity, setQuantity] = useState(1);
  const attemptKey = useRef<string | null>(null);

  const maxDose = Math.min(MAX_PER_ORDER, type.remaining);
  const dose = Math.min(quantity, Math.max(1, maxDose));
  const started = useHasPassed(event.startsAt);

  const order = useMutation({
    mutationFn: () => {
      attemptKey.current ??= crypto.randomUUID();
      return placeOrder({ ticketTypeId: type.id, quantity: dose }, attemptKey.current);
    },
    onSuccess: (created) => {
      attemptKey.current = null;
      void queryClient.invalidateQueries({ queryKey: ["events"] });
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
      navigate(`/pesanan/${created.id}`);
    },
    onError: (error) => {
      if (!isLostAnswer(error)) attemptKey.current = null;
      if (error instanceof ApiError && error.code === "QUOTA_EXHAUSTED") {
        void queryClient.invalidateQueries({ queryKey: ["event", event.id] });
      }
      shake();
    },
  });

  const changeType = (id: string) => {
    attemptKey.current = null;
    order.reset();
    onTypeChange(id);
  };
  const changeDose = (value: number) => {
    attemptKey.current = null;
    order.reset();
    setQuantity(value);
  };

  return (
    <div ref={ref} className="flex flex-col gap-6">
      <fieldset>
        <legend className="mb-3 text-caption text-quiet">Tipe tiket</legend>
        <div className="flex flex-col gap-1">
          {event.ticketTypes.map((t) => {
            const soldOut = t.remaining === 0;
            return (
              <label key={t.id} className={`flex min-h-(--size-button) items-center gap-3 ${soldOut ? "cursor-not-allowed" : ""}`}>
                <input
                  type="radio"
                  name="ticket-type"
                  value={t.id}
                  checked={type.id === t.id}
                  disabled={soldOut}
                  onChange={() => changeType(t.id)}
                  className="size-4 accent-ink"
                />
                <span className={`shrink-0 ${soldOut ? "text-quiet" : "text-ink"}`}>{kindLabel(t.kind)}</span>
                <span aria-hidden="true" className="min-w-4 flex-1 translate-y-1 self-center border-b border-dotted border-ash" />
                <span className={`shrink-0 ${soldOut ? "text-oxblood" : "font-bold text-ink"}`}>
                  {soldOut ? "Habis" : formatRupiah(t.price)}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {started ? (
        <p className="text-graphite">Event ini sudah dimulai, pemesanan ditutup.</p>
      ) : user?.role === "organizer" ? (
        <p className="text-graphite">Pemesanan hanya untuk akun pembeli.</p>
      ) : (
        <>
          {maxDose > 0 && <DoseSelector value={dose} max={maxDose} onChange={changeDose} />}

          {order.isError && (
            <p role="alert" className="text-small text-oxblood">
              {messageFor(order.error)}
              {isLostAnswer(order.error) && " Tekan tombol lagi, pesanan tidak akan tercatat dua kali."}
            </p>
          )}

          {!user ? (
            <Button onClick={() => navigate("/masuk", { state: { from: location.pathname } })}>Masuk untuk memesan</Button>
          ) : (
            <Button onClick={() => order.mutate()} busy={order.isPending} disabled={maxDose === 0}>
              {maxDose === 0
                ? "Kursi habis"
                : order.isPending
                  ? "Memesan"
                  : `Pesan ${dose} tiket · ${formatRupiah(dose * type.price)}`}
            </Button>
          )}
        </>
      )}

      <p className="text-caption text-quiet">
        Kursi ditahan selama 15 menit. Maksimal empat tiket untuk setiap akun.{" "}
        {!user && (
          <Link to="/daftar" className="link-underline text-ink">
            Belum punya akun? Daftar
          </Link>
        )}
      </p>
    </div>
  );
}
