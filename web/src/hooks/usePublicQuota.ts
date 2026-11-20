import { useQueryClient } from "@tanstack/react-query";
import type { PublicEvent, PublicTicketType } from "../api/events";
import { useLiveStream } from "./useLiveStream";

interface QuotaMessage {
  eventId: string;
  ticketTypes: Array<{ id: string; remaining: number }>;
}

// Keeps the cached event list and event details up to date from /events/stream.
// `polling` is true while the stream is down and the page should poll instead.
export function usePublicQuota() {
  const queryClient = useQueryClient();

  return useLiveStream("public", {
    url: async () => "/api/events/stream",
    onOpen: () => {
      void queryClient.invalidateQueries({ queryKey: ["events"] });
      void queryClient.invalidateQueries({ queryKey: ["event"] });
    },
    handlers: {
      quota: (data) => {
        const { eventId, ticketTypes } = data as QuotaMessage;
        const left = new Map(ticketTypes.map((t) => [t.id, t.remaining]));
        const patch = (types: PublicTicketType[]) =>
          types.map((t) => (left.has(t.id) ? { ...t, remaining: left.get(t.id)! } : t));

        queryClient.setQueryData<PublicEvent[]>(["events"], (list) =>
          list?.map((e) => (e.id === eventId ? { ...e, ticketTypes: patch(e.ticketTypes) } : e)),
        );
        queryClient.setQueryData<PublicEvent>(["event", eventId], (e) => e && { ...e, ticketTypes: patch(e.ticketTypes) });
      },
    },
  });
}
