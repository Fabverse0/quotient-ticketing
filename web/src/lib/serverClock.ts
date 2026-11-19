// Estimates how far the browser clock is from the server, from the Date header
// of API responses, so a countdown to expires_at does not trust the browser clock.
const SAMPLES = 5;
const samples: number[] = [];

export function recordServerDate(dateHeader: string | null, sentAt: number, receivedAt: number) {
  if (!dateHeader) return;
  const server = Date.parse(dateHeader);
  if (Number.isNaN(server)) return;
  // Date has one-second resolution; the true instant is on average half a second later.
  const offset = server + 500 - (sentAt + receivedAt) / 2;
  samples.push(offset);
  if (samples.length > SAMPLES) samples.shift();
}

function offsetMs() {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

export const serverNow = () => Date.now() + offsetMs();
