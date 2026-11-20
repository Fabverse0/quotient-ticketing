import { useEffect, useRef, useState } from "react";
import { ApiError } from "../api/errors";

const RETRY_MS = 3000;
const FALLBACK_AFTER_MS = 10_000;
export const POLL_MS = 10_000;

// Retrying cannot fix these: signed out, not the owner, or the event is gone.
// EventSource never exposes a status, so they are only seen on the ticket request,
// which runs the same checks as the stream right before it opens.
const isPermanent = (error: unknown) => error instanceof ApiError && [401, 403, 404].includes(error.status);

interface Options {
  // Resolved on every attempt: an organizer stream needs a fresh ticket each time.
  url: () => Promise<string>;
  handlers: Record<string, (data: unknown) => void>;
  // Changes made while disconnected are never replayed, so the page reloads its data here.
  onOpen: () => void;
  enabled?: boolean;
}

// `polling` is true while the stream has been down for more than 10 seconds;
// the caller then polls every POLL_MS until it is back. `stoppedBy` holds the
// error that ended the stream for good; nothing is retried or polled after it.
export function useLiveStream(key: string, { url, handlers, onOpen, enabled = true }: Options) {
  const [polling, setPolling] = useState(false);
  const [stoppedBy, setStoppedBy] = useState<ApiError>();
  const latest = useRef({ url, handlers, onOpen });
  latest.current = { url, handlers, onOpen };

  useEffect(() => {
    if (!enabled) return;
    setStoppedBy(undefined);
    let source: EventSource | undefined;
    let retry: number | undefined;
    let fallback: number | undefined;
    let stopped = false;

    const lost = () => {
      fallback ??= window.setTimeout(() => setPolling(true), FALLBACK_AFTER_MS);
      retry = window.setTimeout(() => void connect(), RETRY_MS);
    };

    async function connect() {
      let target: string;
      try {
        target = await latest.current.url();
      } catch (error) {
        if (stopped) return;
        if (isPermanent(error)) {
          window.clearTimeout(fallback);
          setPolling(false);
          setStoppedBy(error as ApiError);
          return;
        }
        lost();
        return;
      }
      if (stopped) return;

      const next = new EventSource(target);
      source = next;
      next.onopen = () => {
        window.clearTimeout(fallback);
        fallback = undefined;
        setPolling(false);
        latest.current.onOpen();
      };
      for (const name of Object.keys(latest.current.handlers)) {
        next.addEventListener(name, (event) => latest.current.handlers[name]?.(JSON.parse((event as MessageEvent).data)));
      }
      // Reconnecting by hand instead of letting EventSource do it, so every attempt gets a new URL.
      next.onerror = () => {
        next.close();
        if (source !== next || stopped) return;
        source = undefined;
        lost();
      };
    }

    fallback = window.setTimeout(() => setPolling(true), FALLBACK_AFTER_MS);
    void connect();
    return () => {
      stopped = true;
      source?.close();
      window.clearTimeout(retry);
      window.clearTimeout(fallback);
    };
  }, [key, enabled]);

  return { polling, stoppedBy };
}
