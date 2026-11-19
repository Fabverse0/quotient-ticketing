// Seeds one event and the buyer accounts for the k6 burst, through the public API.
// Writes the ticket type and every buyer token to tools/load-test/.data/seed.json.
//
//   API_URL=http://localhost:3000 ORGANIZER_EMAIL=... ORGANIZER_PASSWORD=... node tools/load-test/seed.mjs
//
// Optional: BUYERS (default 200), QUOTA (Regular quota, default 100).
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const API_URL = process.env.API_URL ?? "http://localhost:3000";
const BUYERS = Number(process.env.BUYERS ?? 200);
const QUOTA = Number(process.env.QUOTA ?? 100);
const { ORGANIZER_EMAIL, ORGANIZER_PASSWORD } = process.env;
// bcrypt makes each sign-up cost tens of milliseconds of API CPU.
const PARALLEL_SIGNUPS = 20;
const OUTPUT = fileURLToPath(new URL("./.data/seed.json", import.meta.url));

async function api(path, { token, body } = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  // Text first, so a non-JSON error page still reports its status.
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} answered ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

if (!ORGANIZER_EMAIL || !ORGANIZER_PASSWORD) {
  console.error("ORGANIZER_EMAIL and ORGANIZER_PASSWORD are required (the account the API seeds at start).");
  process.exit(2);
}

const { token: organizerToken } = await api("/auth/login", {
  body: { email: ORGANIZER_EMAIL, password: ORGANIZER_PASSWORD },
});

const runId = Date.now().toString(36);
const event = await api("/events", {
  token: organizerToken,
  body: {
    title: `Load test ${runId}`,
    venue: "k6",
    startsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    ticketTypes: [
      { kind: "REGULAR", price: 100_000, quota: QUOTA },
      { kind: "VIP", price: 400_000, quota: 20 },
    ],
  },
});
const regular = event.ticketTypes.find((t) => t.kind === "REGULAR");

const tokens = new Array(BUYERS);
let next = 0;
async function signUpWorker() {
  while (next < BUYERS) {
    const i = next++;
    const { token } = await api("/auth/register", {
      body: { email: `loadtest-${runId}-${i}@quotient.local`, password: "load-test-buyer", name: `Buyer ${i}` },
    });
    tokens[i] = token;
  }
}
await Promise.all(Array.from({ length: PARALLEL_SIGNUPS }, signUpWorker));

await mkdir(fileURLToPath(new URL("./.data/", import.meta.url)), { recursive: true });
await writeFile(OUTPUT, JSON.stringify({ eventId: event.id, ticketTypeId: regular.id, quota: QUOTA, tokens }));
console.log(`Seeded event ${event.id}: Regular quota ${QUOTA}, ${BUYERS} buyers -> ${OUTPUT}`);
