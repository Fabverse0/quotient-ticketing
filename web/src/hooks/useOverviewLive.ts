import { useQueryClient } from "@tanstack/react-query";
import type { OrganizerEvent } from "../api/organizer";
import { useLiveStream } from "./useLiveStream";

// The public stream says when any event's quota moved, including other organizers'
// events, and its message has no sold count. The overview reloads the organizer's own
// list, but only when the event that moved is one of theirs.
// `polling` is true while the stream is down and the page should poll instead.
export function useOverviewLive() {
  const queryClient = useQueryClient();
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["organizer-events"] });
  return useLiveStream("overview", {
    url: async () => "/api/events/stream",
    onOpen: refresh,
    handlers: {
      quota: (data) => {
        const { eventId } = data as { eventId: string };
        const mine = queryClient.getQueryData<OrganizerEvent[]>(["organizer-events"]);
        if (!mine || mine.some((event) => event.id === eventId)) refresh();
      },
    },
  });
}
