import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { messageFor } from "../api/errors";
import type { TicketKind } from "../api/events";
import { listMyEvents } from "../api/organizer";
import { Bar } from "../components/Bar";
import { PageMessage } from "../components/PageState";
import { formatCount, formatDayMonth, formatDateTime, kindLabel } from "../lib/format";
import { stagger } from "../lib/stagger";

const buttonLink =
  "soft inline-flex h-(--size-button) items-center justify-center rounded-chip bg-ink px-5 font-bold text-canvas " +
  "hover:bg-ink-deep";

const KINDS: Array<{ kind: TicketKind; fill: string; track: string }> = [
  { kind: "REGULAR", fill: "bg-inkblue", track: "bg-blue-wash" },
  { kind: "VIP", fill: "bg-umber", track: "bg-clay" },
];

export function OrganizerEventsPage() {
  const events = useQuery({ queryKey: ["organizer-events"], queryFn: listMyEvents });

  return (
    <section className="flex flex-col gap-6">
      <div className="rise flex flex-wrap items-end justify-between gap-4" style={stagger(0)}>
        <div>
          <h1 className="text-title font-bold text-ink">Event saya</h1>
          <p className="mt-1 text-small text-quiet">Pilih event untuk melihat analitiknya.</p>
        </div>
        <Link to="/organizer/event/baru" className={buttonLink}>
          Buat event
        </Link>
      </div>

      {events.isPending && (
        <ul role="status" aria-label="Memuat" className="grid gap-4 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="h-40 animate-pulse rounded-card bg-wall" />
          ))}
        </ul>
      )}
      {events.isError && (
        <PageMessage action={{ label: "Muat ulang event", onClick: () => void events.refetch() }}>
          {messageFor(events.error)}
        </PageMessage>
      )}
      {events.data?.length === 0 && <PageMessage ornament>Belum ada event. Buat event pertamamu.</PageMessage>}
      {events.data && events.data.length > 0 && (
        <ul className="grid gap-4 md:grid-cols-2">
          {events.data.map((event, i) => {
            const { day, month } = formatDayMonth(event.startsAt);
            return (
              <li key={event.id} className="rise" style={stagger(i + 1)}>
                <Link
                  to={`/organizer/event/${event.id}`}
                  className="soft flex h-full flex-col gap-4 rounded-card bg-wall p-5 hover:bg-blue-wash"
                >
                  <span className="flex items-center gap-4">
                    <span
                      aria-hidden="true"
                      className="flex size-14 shrink-0 flex-col items-center justify-center rounded-chip bg-clay text-ink"
                    >
                      <span className="text-lead font-bold leading-none">{day}</span>
                      <span className="text-caption">{month}</span>
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-body font-bold text-ink">{event.title}</span>
                      <span className="block truncate text-caption text-graphite">
                        {formatDateTime(event.startsAt)}, {event.venue}
                      </span>
                    </span>
                  </span>
                  {KINDS.map(({ kind, fill, track }) => {
                    const type = event.ticketTypes.find((t) => t.kind === kind);
                    if (!type) return null;
                    return (
                      <span key={kind} className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-3 text-caption">
                        <span className="text-graphite">{kindLabel(kind)}</span>
                        <Bar value={type.sold} max={type.quota} label={`${kindLabel(kind)}, ${event.title}`} fillClassName={fill} trackClassName={track} />
                        <span className="min-w-20 text-right tabular-nums text-ink">
                          {formatCount(type.sold)} / {formatCount(type.quota)}
                        </span>
                      </span>
                    );
                  })}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
