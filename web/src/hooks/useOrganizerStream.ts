import { useQueryClient } from "@tanstack/react-query";
import { streamTicket, type OrganizerEvent } from "../api/organizer";
import { useLiveStream } from "./useLiveStream";

interface QuotaMessage {
  eventId: string;
  ticketTypes: Array<{ id: string; quota: number; sold: number; reserved: number; remaining: number }>;
}

// Live counters and recent orders for one event's dashboard. Returns true while
// the stream is down and the dashboard should poll instead.
export function useOrganizerStream(eventId: string) {
  const queryClient = useQueryClient();

  return useLiveStream(`organizer:${eventId}`, {
    url: async () => {
      const { ticket } = await streamTicket(eventId);
      return `/api/organizer/events/${eventId}/stream?ticket=${encodeURIComponent(ticket)}`;
    },
    onOpen: () => {
      void queryClient.invalidateQueries({ queryKey: ["organizer-event", eventId] });
      void queryClient.invalidateQueries({ queryKey: ["organizer-orders", eventId] });
    },
    handlers: {
      quota: (data) => {
        const counters = new Map((data as QuotaMessage).ticketTypes.map((t) => [t.id, t]));
        queryClient.setQueryData<OrganizerEvent>(
          ["organizer-event", eventId],
          (event) =>
            event && {
              ...event,
              ticketTypes: event.ticketTypes.map((t) => {
                const next = counters.get(t.id);
                return next
                  ? { ...t, quota: next.quota, sold: next.sold, reserved: next.reserved, remaining: next.remaining }
                  : t;
              }),
            },
        );
      },
      orders: () => void queryClient.invalidateQueries({ queryKey: ["organizer-orders", eventId] }),
    },
  });
}
