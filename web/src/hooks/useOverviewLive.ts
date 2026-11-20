import { useQueryClient } from "@tanstack/react-query";
import { useLiveStream } from "./useLiveStream";

// The public stream says when any event's quota moved. The overview reloads the
// organizer's own list on each message, since the public message has no sold count.
// `polling` is true while the stream is down and the page should poll instead.
export function useOverviewLive() {
  const queryClient = useQueryClient();
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["organizer-events"] });
  return useLiveStream("overview", {
    url: async () => "/api/events/stream",
    onOpen: refresh,
    handlers: { quota: refresh },
  });
}
