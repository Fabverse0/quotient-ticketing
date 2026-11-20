// Demo data: a few fictional events and orders in every status, created through
// the real business logic (createApp in-process), never by writing rows directly.
// Run from the repo root: npm --prefix api run demo-data
// Never runs on start, and the load test does not use it.
//
// EXPIRED orders are placed on a clock set 20 minutes back, then the real
// sweeper expires them, so every counter and invariant stays consistent.
import { randomBytes } from "node:crypto";
import { createApp } from "../../api/src/app.js";
import { sweepExpiredOrders } from "../../api/src/jobs/sweeper.js";
import { seedOrganizer } from "../../api/src/modules/auth/seed.js";
import { createDatabase } from "../../api/src/shared/db/client.js";

const DAY = 24 * 60 * 60 * 1000;
const ORGANIZER = {
  email: process.env.DEMO_ORGANIZER_EMAIL ?? "organizer@quotient.local",
  password: process.env.DEMO_ORGANIZER_PASSWORD ?? "organizer-demo-pass",
};
const BUYER_PASSWORD = "pembeli-demo-pass";
const NAMED_BUYERS = ["Ayu Lestari", "Bima Pratama", "Citra Wulandari"];

interface Plan {
  title: string;
  venue: string;
  description: string;
  inDays: number;
  wibTime: string;
  regular: { price: number; quota: number };
  vip: { price: number; quota: number };
  // [kind, quantity, outcome] per order, spread across buyers.
  orders: Array<["REGULAR" | "VIP", number, "PAID" | "PENDING" | "CANCELLED" | "EXPIRED"]>;
}

const PLANS: Plan[] = [
  {
    title: "Malam Jazz Kota Lama",
    venue: "Gedung Serbaguna Kota Lama, Semarang",
    description: "Tiga kuartet jazz lokal bergantian di satu panggung. Pintu dibuka pukul 18.30.",
    inDays: 10,
    wibTime: "19:30",
    regular: { price: 150_000, quota: 120 },
    vip: { price: 450_000, quota: 30 },
    orders: [
      ["REGULAR", 2, "PAID"], ["REGULAR", 4, "PAID"], ["VIP", 2, "PAID"], ["REGULAR", 3, "PENDING"],
      ["REGULAR", 1, "CANCELLED"], ["VIP", 1, "EXPIRED"], ["REGULAR", 2, "PAID"], ["REGULAR", 4, "PAID"],
    ],
  },
  {
    title: "Festival Film Pendek Nusantara",
    venue: "Aula Sinema Taman Budaya, Yogyakarta",
    description: "Dua belas film pendek dari enam kota, diikuti diskusi bersama para sutradara.",
    inDays: 17,
    wibTime: "13:00",
    regular: { price: 75_000, quota: 200 },
    vip: { price: 200_000, quota: 40 },
    orders: [["REGULAR", 4, "PAID"], ["REGULAR", 2, "EXPIRED"], ["VIP", 2, "PENDING"], ["REGULAR", 1, "PAID"]],
  },
  {
    title: "Konser Orkestra Akhir Tahun",
    venue: "Balai Musik Kemayoran, Jakarta",
    description: "Program malam ini: Dvořák, Simfoni No. 9, dan aransemen lagu daerah untuk orkestra.",
    inDays: 35,
    wibTime: "19:00",
    regular: { price: 250_000, quota: 300 },
    vip: { price: 750_000, quota: 50 },
    orders: [["VIP", 4, "PAID"], ["REGULAR", 2, "PAID"], ["REGULAR", 2, "CANCELLED"]],
  },
  {
    title: "Lokakarya Fotografi Analog",
    venue: "Ruang Kreatif Braga, Bandung",
    description: "Memotret dengan film 35 mm dan mencuci sendiri di kamar gelap. Kamera disediakan.",
    inDays: 6,
    wibTime: "10:00",
    regular: { price: 120_000, quota: 20 },
    vip: { price: 300_000, quota: 6 },
    orders: [
      ["REGULAR", 4, "PAID"], ["REGULAR", 4, "PAID"], ["REGULAR", 3, "PAID"], ["VIP", 4, "PAID"],
      ["REGULAR", 2, "PENDING"],
    ],
  },
  {
    title: "Pentas Teater Rumah Kayu",
    venue: "Panggung Kecil Sanur, Denpasar",
    description: "Lakon dua babak tentang sebuah keluarga dan rumah yang hendak dijual.",
    inDays: 12,
    wibTime: "20:00",
    regular: { price: 90_000, quota: 12 },
    vip: { price: 220_000, quota: 4 },
    orders: [["REGULAR", 4, "PAID"], ["REGULAR", 4, "PAID"], ["REGULAR", 4, "PAID"], ["VIP", 4, "PAID"]],
  },
];

function wibDate(inDays: number, wibTime: string) {
  const day = new Date(Date.now() + inDays * DAY).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
  return new Date(`${day}T${wibTime}:00+07:00`).toISOString();
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required, e.g. postgres://quotient:quotient@localhost:5433/quotient");
  process.exit(2);
}

let current = Date.now();
const clock = { now: () => new Date(current) };
const { db, close } = createDatabase({ databaseUrl, dbPoolMax: 4 });
const app = createApp({
  db,
  clock,
  // In-process only: these tokens never leave this script.
  auth: { secret: randomBytes(32).toString("hex"), expiresInSeconds: 3600 },
  simulatedPaymentEnabled: true,
});

async function call<T>(method: string, path: string, { token, body }: { token?: string; body?: unknown } = {}) {
  const res = await app.request(path, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${path} answered ${res.status}: ${JSON.stringify(json)}`);
  return json as T;
}

async function buyer(name: string, email: string) {
  const res = await app.request("/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password: BUYER_PASSWORD }),
  });
  if (res.status === 201) return ((await res.json()) as { token: string }).token;
  return (await call<{ token: string }>("POST", "/auth/login", { body: { email, password: BUYER_PASSWORD } })).token;
}

try {
  await seedOrganizer(db, ORGANIZER);
  const organizer = (await call<{ token: string }>("POST", "/auth/login", { body: ORGANIZER })).token;

  const named = await Promise.all(
    NAMED_BUYERS.map((name, i) => buyer(name, `pembeli${i + 1}@quotient.local`)),
  );
  const extra = await Promise.all(
    Array.from({ length: 9 }, (_, i) => buyer(`Pembeli Demo ${i + 4}`, `pembeli${i + 4}@quotient.local`)),
  );
  const buyers = [...named, ...extra];

  const existing = new Set((await call<Array<{ title: string }>>("GET", "/events")).map((e) => e.title));
  let created = 0;

  for (const plan of PLANS) {
    if (existing.has(plan.title)) {
      console.log(`Skipping "${plan.title}": already there`);
      continue;
    }
    const event = await call<{ id: string; ticketTypes: Array<{ id: string; kind: string }> }>("POST", "/events", {
      token: organizer,
      body: {
        title: plan.title,
        venue: plan.venue,
        description: plan.description,
        startsAt: wibDate(plan.inDays, plan.wibTime),
        ticketTypes: [
          { kind: "REGULAR", ...plan.regular },
          { kind: "VIP", ...plan.vip },
        ],
      },
    });
    const typeId = (kind: string) => event.ticketTypes.find((t) => t.kind === kind)!.id;

    for (const [index, [kind, quantity, outcome]] of plan.orders.entries()) {
      const token = buyers[index % buyers.length]!;
      current = outcome === "EXPIRED" ? Date.now() - 20 * 60 * 1000 : Date.now();
      const order = await call<{ id: string }>("POST", "/orders", {
        token,
        body: { ticketTypeId: typeId(kind), quantity },
      });
      current = Date.now();
      if (outcome === "PAID") await call("POST", `/orders/${order.id}/pay`, { token });
      if (outcome === "CANCELLED") await call("POST", `/orders/${order.id}/cancel`, { token });
    }
    created++;
    console.log(`Created "${plan.title}" with ${plan.orders.length} orders`);
  }

  const expired = await sweepExpiredOrders(db, new Date());
  console.log(`\n${created} events created, ${expired} orders expired by the sweeper.`);
  console.log(`Organizer: ${ORGANIZER.email} / ${ORGANIZER.password}`);
  NAMED_BUYERS.forEach((name, i) => console.log(`Buyer ${name}: pembeli${i + 1}@quotient.local / ${BUYER_PASSWORD}`));
} finally {
  await close();
}
