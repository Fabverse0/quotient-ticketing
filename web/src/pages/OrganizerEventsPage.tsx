import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { messageFor } from "../api/errors";
import { listMyEvents } from "../api/organizer";
import { PageMessage } from "../components/PageState";
import { formatCount, formatDateTime } from "../lib/format";

const buttonLink =
  "inline-flex h-(--size-button) items-center justify-center rounded-ui bg-ink px-5 font-bold text-canvas " +
  "transition-colors duration-(--dur-fast) hover:bg-ink-deep";

export function OrganizerEventsPage() {
  const events = useQuery({ queryKey: ["organizer-events"], queryFn: listMyEvents });

  return (
    <section className="py-12">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-label uppercase tracking-label text-quiet">Dashboard organizer</p>
          <h1 className="mt-2 font-display text-title text-ink">Event saya</h1>
        </div>
        <Link to="/organizer/event/baru" className={buttonLink}>
          Buat event
        </Link>
      </div>

      {events.isPending && (
        <ul role="status" aria-label="Memuat" className="flex flex-col">
          {[0, 1, 2].map((i) => (
            <li key={i} className="h-16 animate-pulse border-b border-mist bg-wall/60" />
          ))}
        </ul>
      )}
      {events.isError && (
        <PageMessage action={{ label: "Muat ulang event", onClick: () => void events.refetch() }}>
          {messageFor(events.error)}
        </PageMessage>
      )}
      {events.data?.length === 0 && <PageMessage>Belum ada event. Buat event pertamamu.</PageMessage>}
      {events.data && events.data.length > 0 && (
        <ul className="flex flex-col border-t border-mist">
          {events.data.map((event) => {
            const quota = event.ticketTypes.reduce((n, t) => n + t.quota, 0);
            const sold = event.ticketTypes.reduce((n, t) => n + t.sold, 0);
            const held = event.ticketTypes.reduce((n, t) => n + t.reserved, 0);
            return (
              <li key={event.id} className="border-b border-mist">
                <Link
                  to={`/organizer/event/${event.id}`}
                  className="grid gap-1 py-4 hover:bg-wash sm:grid-cols-[1fr_auto] sm:items-center sm:gap-6 sm:px-2"
                >
                  <span>
                    <span className="block text-ink">{event.title}</span>
                    <span className="text-small text-quiet">
                      {formatDateTime(event.startsAt)} · {event.venue}
                    </span>
                  </span>
                  <span className="text-small text-quiet">
                    {formatCount(sold)} terjual · {formatCount(held)} ditahan · {formatCount(quota)} kursi
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
