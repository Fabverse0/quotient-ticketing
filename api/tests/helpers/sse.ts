export interface SseMessage {
  event?: string;
  data?: string;
  retry?: number;
  comment?: string;
}

function parseBlock(block: string): SseMessage {
  const message: SseMessage = {};
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith(":")) message.comment = line.slice(1).trim();
    else if (line.startsWith("event: ")) message.event = line.slice(7);
    else if (line.startsWith("data: ")) data.push(line.slice(6));
    else if (line.startsWith("retry: ")) message.retry = Number(line.slice(7));
  }
  if (data.length > 0) message.data = data.join("\n");
  return message;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Reads an SSE response in the background so a test can wait for messages and count them.
export function readSse(res: Response) {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  const messages: SseMessage[] = [];
  let ended = false;
  let buffer = "";

  const pump = (async () => {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let end: number;
        while ((end = buffer.indexOf("\n\n")) >= 0) {
          messages.push(parseBlock(buffer.slice(0, end)));
          buffer = buffer.slice(end + 2);
        }
      }
    } catch {
      // A cancelled reader rejects the pending read.
    } finally {
      ended = true;
    }
  })();

  return {
    messages,
    get ended() {
      return ended;
    },
    async waitFor(match: (m: SseMessage) => boolean, timeoutMs = 3000) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const found = messages.find(match);
        if (found) return found;
        if (ended || Date.now() > deadline) throw new Error("expected SSE message did not arrive");
        await sleep(20);
      }
    },
    async waitForEnd(timeoutMs = 3000) {
      const deadline = Date.now() + timeoutMs;
      while (!ended) {
        if (Date.now() > deadline) throw new Error("SSE stream did not end");
        await sleep(20);
      }
    },
    async close() {
      await reader.cancel();
      await pump;
    },
  };
}

export const quotaFor = (eventId: string) => (m: SseMessage) =>
  m.event === "quota" && m.data !== undefined && JSON.parse(m.data).eventId === eventId;
