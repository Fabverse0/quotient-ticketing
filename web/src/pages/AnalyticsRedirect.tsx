import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router";
import { messageFor } from "../api/errors";
import { listMyEvents } from "../api/organizer";
import { PageLoading, PageMessage } from "../components/PageState";
import { defaultEvent } from "../lib/organizerEvents";
import { serverNow } from "../lib/serverClock";

// /organizer/analitik has no page of its own: it opens an event's analytics.
export function AnalyticsRedirect() {
  const events = useQuery({ queryKey: ["organizer-events"], queryFn: listMyEvents });
  if (events.isPending) return <PageLoading />;
  if (events.isError) {
    return (
      <PageMessage action={{ label: "Muat ulang event", onClick: () => void events.refetch() }}>
        {messageFor(events.error)}
      </PageMessage>
    );
  }
  const target = defaultEvent(events.data, serverNow());
  return <Navigate to={target ? `/organizer/event/${target.id}` : "/organizer/event"} replace />;
}
