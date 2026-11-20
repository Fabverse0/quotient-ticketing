import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { listEvents, seatsLeft, type PublicEvent } from "../api/events";
import { messageFor } from "../api/errors";
import { Cover } from "../components/Cover";
import { LiveNumber } from "../components/LiveNumber";
import { PageLoading, PageMessage } from "../components/PageState";
import { Reveal } from "../components/Reveal";
import { POLL_MS } from "../hooks/useLiveStream";
import { usePublicQuota } from "../hooks/usePublicQuota";
import { formatDateTime } from "../lib/format";

// Fewer than 15 seats left reads as "tinggal sedikit" (DESIGN.md).
export const FEW_SEATS = 15;

export function SeatsLeft({ left, className = "" }: { left: number; className?: string }) {
  if (left === 0) return <span className={`text-oxblood ${className}`}>Habis</span>;
  const tone = left < FEW_SEATS ? "text-ochre-text" : "text-quiet";
  return (
    <span className={`${tone} ${className}`}>
      <LiveNumber value={left} /> kursi
    </span>
  );
}

function EventTile({ event }: { event: PublicEvent }) {
  const left = seatsLeft(event);
  return (
    <Link
      to={`/event/${event.id}`}
      className="tile flex flex-col gap-4 rounded-ui bg-wall p-5 text-ink"
      aria-label={`${event.title}, ${formatDateTime(event.startsAt)}, ${left === 0 ? "habis" : `${left} kursi tersisa`}`}
    >
      <div className="flex justify-center px-8 py-6">
        <div className="lift w-3/5">
          <Cover seed={event.id} muted={left === 0} className="aspect-[4/5] w-full" />
        </div>
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-body">{event.title}</h2>
        <span className="swap shrink-0 text-sm">
          <SeatsLeft left={left} />
          <span aria-hidden="true" className="text-ink">
            Lihat event
          </span>
        </span>
      </div>
      <p className="text-caption text-quiet">
        {formatDateTime(event.startsAt)} · {event.venue}
      </p>
    </Link>
  );
}

export function EventsPage() {
  const { polling } = usePublicQuota();
  const events = useQuery({ queryKey: ["events"], queryFn: listEvents, refetchInterval: polling ? POLL_MS : false });

  return (
    <>
      <p className="mx-auto max-w-(--width-lead) py-16 text-center text-lead text-graphite">
        Kursi yang terbatas, dibagi tepat ke setiap pembeli. Pilih event, tahan kursimu, dan bayar dalam 15 menit.
      </p>
      <h1 className="mb-6 font-display text-small text-quiet">Event</h1>
      {events.isPending && <PageLoading />}
      {events.isError && (
        <PageMessage action={{ label: "Muat ulang daftar", onClick: () => void events.refetch() }}>
          {messageFor(events.error)}
        </PageMessage>
      )}
      {events.data?.length === 0 && <PageMessage>Belum ada event yang dibuka. Cek lagi nanti.</PageMessage>}
      {events.data && events.data.length > 0 && (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {events.data.map((event, index) => (
            <li key={event.id}>
              <Reveal index={index}>
                <EventTile event={event} />
              </Reveal>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
