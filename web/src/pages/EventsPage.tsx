import { useQuery } from "@tanstack/react-query";
import { listEvents, type PublicEvent } from "../api/events";
import { messageFor } from "../api/errors";
import { Cover } from "../components/Cover";
import { PageLoading, PageMessage } from "../components/PageState";
import { Reveal } from "../components/Reveal";

// Fewer than 15 seats left reads as "tinggal sedikit" (DESIGN.md).
const FEW_SEATS = 15;

function Seats({ event }: { event: PublicEvent }) {
  const left = event.ticketTypes.reduce((sum, t) => sum + t.remaining, 0);
  if (left === 0) return <span className="text-sm text-oxblood">Habis</span>;
  const tone = left < FEW_SEATS ? "text-ochre-text" : "text-quiet";
  return <span className={`text-sm ${tone}`}>{left.toLocaleString("id-ID")} kursi</span>;
}

const when = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

export function EventsPage() {
  const events = useQuery({ queryKey: ["events"], queryFn: listEvents });

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
          {events.data.map((event, index) => {
            const soldOut = event.ticketTypes.every((t) => t.remaining === 0);
            return (
              <li key={event.id}>
                <Reveal index={index}>
                  <article className="flex flex-col gap-4 rounded-ui bg-wall p-5">
                    <div className="flex justify-center px-8 py-6">
                      <Cover seed={event.id} muted={soldOut} className="aspect-[4/5] w-3/5" />
                    </div>
                    <div className="flex items-baseline justify-between gap-3">
                      <h2 className="text-body text-ink">{event.title}</h2>
                      <Seats event={event} />
                    </div>
                    <p className="text-caption text-quiet">
                      {when(event.startsAt)} · {event.venue}
                    </p>
                  </article>
                </Reveal>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
