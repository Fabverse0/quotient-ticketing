import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { messageFor } from "../api/errors";
import { listTickets, type BuyerTicket } from "../api/orders";
import { PageLoading, PageMessage } from "../components/PageState";
import { QrCode } from "../components/QrCode";
import { Reveal } from "../components/Reveal";
import { Seal } from "../components/Seal";
import { formatDateTime, kindLabel } from "../lib/format";

function TicketCard({ ticket, of }: { ticket: BuyerTicket; of: number }) {
  const lot = ticket.orderId.slice(0, 6).toUpperCase();
  return (
    <article className="rounded-ui border border-ink bg-field p-1 shadow-rest">
      <div className="relative flex flex-col gap-4 rounded-cover border border-ink p-6">
        <div className="absolute right-4 top-4">
          <Seal />
        </div>
        <p className="pr-20 text-label uppercase tracking-label text-quiet">
          Tiket · Lot {lot} · Kursi {ticket.seq} dari {of}
        </p>
        <h2 className="pr-16 font-display text-lead uppercase tracking-band text-ink">{ticket.event.title}</h2>
        <p className="text-small text-graphite">
          {kindLabel(ticket.ticketType.kind)} · {formatDateTime(ticket.event.startsAt)}
          <br />
          {ticket.event.venue}
        </p>
        <hr className="border-t border-dashed border-ash" />
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-label uppercase tracking-label text-quiet">Kode tiket</span>
            <span className="font-mono text-body text-ink">{ticket.code}</span>
          </div>
          <QrCode value={ticket.code} label={`QR kode tiket ${ticket.code}`} />
        </div>
      </div>
    </article>
  );
}

export function TicketsPage() {
  const tickets = useQuery({ queryKey: ["tickets"], queryFn: listTickets });
  const perOrder = new Map<string, number>();
  for (const t of tickets.data ?? []) perOrder.set(t.orderId, (perOrder.get(t.orderId) ?? 0) + 1);

  return (
    <section className="py-12">
      <h1 className="mb-8 font-display text-title text-ink">Tiket saya</h1>
      {tickets.isPending && <PageLoading />}
      {tickets.isError && (
        <PageMessage action={{ label: "Muat ulang tiket", onClick: () => void tickets.refetch() }}>
          {messageFor(tickets.error)}
        </PageMessage>
      )}
      {tickets.data?.length === 0 && (
        <PageMessage>
          Tiket yang kamu bayar akan muncul di sini.{" "}
          <Link to="/" className="link-underline text-ink">
            Lihat event
          </Link>
        </PageMessage>
      )}
      {tickets.data && tickets.data.length > 0 && (
        <ul className="grid gap-8 md:grid-cols-2">
          {tickets.data.map((ticket, index) => (
            <li key={ticket.id}>
              <Reveal index={index % 4}>
                <TicketCard ticket={ticket} of={perOrder.get(ticket.orderId) ?? 1} />
              </Reveal>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
