# Quotient

Penjualan tiket event dengan kuota terbatas. Nama "Quotient" berarti hasil bagi: kuota yang terbatas dibagi tepat ke banyak pembeli, tidak lebih satu pun.

Pertanyaan utama proyek ini: kalau 200 orang memesan di detik yang sama untuk 100 kursi, apakah ada yang terjual lebih? Jawabannya dibuktikan dengan uji beban dan invariant checker, lihat [bukti uji 200 pesanan](#bukti-200-pembeli-kuota-100).

Stack: Node.js, TypeScript, Hono, Drizzle, PostgreSQL, React, Vite, TanStack Query, Tailwind, Nginx. Alasan setiap keputusan desain ada di [DECISIONS.md](DECISIONS.md).

## Arsitektur

```mermaid
flowchart LR
    Browser["Browser<br/>React"] --> Nginx["Nginx :8080"]
    Nginx -->|"/api/..."| API["API Hono :3000"]
    Provider["Penyedia pembayaran"] -->|"webhook bertanda tangan"| API
    API -->|"transaksi"| PG[("PostgreSQL")]
    PG -->|"trigger + NOTIFY saat commit"| API
    API ==>|"SSE: sisa kuota langsung"| Nginx
    Nginx ==> Browser
```

Satu origin untuk browser: Nginx menyajikan frontend dan meneruskan `/api/` ke API. Kuota hanya berubah lewat transaksi di Postgres, dan setiap perubahan disiarkan ke browser lewat trigger, `LISTEN/NOTIFY`, dan SSE. Versi lengkap ada di [docs/diagrams/architecture.md](docs/diagrams/architecture.md).

## Menjalankan

Yang dibutuhkan: Docker dengan Compose.

```bash
docker compose up --build
```

Satu perintah itu membangun dan menyalakan Postgres, API (migrasi dan akun organizer dibuat otomatis saat start), dan frontend. Setelah semuanya sehat, buka **http://localhost:8080**.

| Layanan | Alamat |
|---|---|
| Aplikasi (frontend + `/api`) | http://localhost:8080 |
| API langsung | http://localhost:3000 (cek dengan `/health`) |
| Postgres | `localhost:5433`, user, password, dan database `quotient` |

Port Postgres dan API hanya dibuka di `127.0.0.1`, jadi tidak terjangkau dari jaringan. Hanya aplikasi di port 8080 yang dibuka ke luar mesin.

Akun bawaan untuk development (rahasia dan password ini hanya untuk lokal, jangan dipakai di tempat lain):

| Peran | Email | Password |
|---|---|---|
| Organizer | `organizer@quotient.local` | `organizer-demo-pass` |
| Pembeli | daftar sendiri di `/daftar` | bebas, minimal 8 karakter |

Nilai bawaan bisa diganti lewat variabel lingkungan atau file `.env`; daftar lengkapnya ada di [.env.example](.env.example). Rahasia bawaan (`JWT_SECRET` dan `PAYMENT_WEBHOOK_SECRET`, berawalan `dev-only-`) ditolak API saat `NODE_ENV=production`, jadi tidak bisa terbawa ke lingkungan nyata tanpa sengaja.

Alur singkat untuk dicoba: masuk sebagai organizer, buat event di **Buat event**, lalu daftar sebagai pembeli di jendela lain, pesan tiket, dan bayar. Angka sisa kuota di dashboard organizer bergerak langsung selama pesanan masuk.

Untuk development frontend dengan hot reload: `npm --prefix web run dev` (Vite di port 5173, `/api` diteruskan ke `localhost:3000`).

## Menjalankan test

Yang dibutuhkan: Node.js 22 atau lebih baru dan Docker yang sedang berjalan. Test memakai Postgres asli lewat Testcontainers, bukan mock.

```bash
npm --prefix api ci
npm --prefix api test
```

Semua test berjalan sekitar dua menit. Container test diberi label dan dibersihkan otomatis setelah test selesai. Pemeriksaan tipe: `cd api && npx tsc -p .`.

## Menandai pesanan lunas

Pembayaran disimulasikan dengan tiga cara. Hasilnya sama: pesanan menjadi `PAID` dan tiket terbit, hanya satu kali.

1. **Tombol di halaman pesanan.** Setelah memesan, buka pesanan di `/pesanan` lalu tekan **Bayar sekarang**. Tombol ini memanggil endpoint simulasi, yang hanya aktif saat `NODE_ENV` bukan `production`.
2. **Endpoint simulasi.** `POST /orders/:id/pay` dengan token pembeli pemilik pesanan:

   ```bash
   curl -X POST http://localhost:3000/orders/<ORDER_ID>/pay -H "Authorization: Bearer <TOKEN_PEMBELI>"
   ```

3. **Webhook bertanda tangan.** `POST /webhooks/payment` tanpa JWT. Header `X-Signature` berisi HMAC-SHA256 (hex) dari byte body mentah, dengan kunci `PAYMENT_WEBHOOK_SECRET` (nilai bawaan compose: `dev-only-webhook-secret-change-before-real-use`). `amount` harus sama dengan total pesanan.

   ```bash
   SECRET=dev-only-webhook-secret-change-before-real-use
   BODY='{"event_id":"evt-001","event_type":"payment.succeeded","order_id":"<ORDER_ID>","amount":<TOTAL_PESANAN>}'
   SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -hex | sed 's/^.* //')
   curl -X POST http://localhost:3000/webhooks/payment \
     -H "Content-Type: application/json" -H "X-Signature: $SIG" -d "$BODY"
   ```

   Mengirim `event_id` yang sama lagi dibalas `duplicate: true` tanpa memproses ulang. Webhook yang datang setelah pesanan kedaluwarsa menandai pesanan `REFUND_REQUIRED`. Alurnya ada di [docs/diagrams/webhook-sequence.md](docs/diagrams/webhook-sequence.md).

## Ringkasan API

Semua body JSON memakai camelCase, kecuali payload webhook (snake_case). Error selalu berbentuk `{ "error": { "code": "...", "message": "..." } }`. Token dikirim sebagai `Authorization: Bearer <token>`.

| Endpoint | Akses | Fungsi |
|---|---|---|
| `GET /health` | publik | Status API dan database |
| `POST /auth/register`, `POST /auth/login` | publik | Daftar sebagai pembeli, masuk |
| `GET /auth/me` | login | Profil dan peran dari token |
| `GET /events`, `GET /events/:id` | publik | Daftar event dan sisa kuota (`remaining`) per tipe |
| `GET /events/stream` | publik | SSE: sisa kuota berubah langsung |
| `POST /events` | organizer | Buat event dengan tepat dua tipe tiket (REGULAR dan VIP) |
| `GET /organizer/events`, `GET /organizer/events/:id` | organizer pemilik | Event milik sendiri dengan `quota`, `sold`, `reserved` |
| `GET /organizer/events/:id/orders` | organizer pemilik | Pesanan terbaru (`?limit=1..50`) |
| `POST /organizer/events/:id/stream-ticket`, `GET /organizer/events/:id/stream?ticket=` | organizer pemilik | Tiket stream 60 detik dan SSE dashboard |
| `POST /orders` | pembeli | Pesan 1 sampai 4 tiket, header `Idempotency-Key` opsional |
| `GET /orders`, `GET /orders/:id` | pembeli pemilik | Riwayat pesanan, dan satu pesanan beserta tiketnya |
| `POST /orders/:id/cancel` | pembeli pemilik | Batalkan pesanan PENDING, kuota langsung kembali |
| `POST /orders/:id/pay` | pembeli pemilik | Simulasi bayar. Tidak ada saat `NODE_ENV=production` |
| `GET /tickets` | pembeli | Semua tiket yang sudah terbit |
| `POST /webhooks/payment` | penyedia, bertanda tangan | Webhook pembayaran |
| `GET /admin/invariants` | organizer | Laporan invariant (`?eventId=` membatasi ke satu event) |

Kode error yang dipakai:

| Status | Kode |
|---|---|
| 400 | `VALIDATION_ERROR`, `INVALID_JSON` |
| 401 | `UNAUTHORIZED`, `INVALID_TOKEN`, `INVALID_CREDENTIALS`, `INVALID_SIGNATURE` |
| 403 | `FORBIDDEN` |
| 404 | `NOT_FOUND`, `EVENT_NOT_FOUND`, `TICKET_TYPE_NOT_FOUND`, `ORDER_NOT_FOUND` |
| 409 | `EMAIL_TAKEN`, `EVENT_ALREADY_STARTED`, `BUYER_LIMIT_EXCEEDED`, `QUOTA_EXHAUSTED`, `ORDER_NOT_PENDING`, `ORDER_EXPIRED` |
| 413 | `PAYLOAD_TOO_LARGE` |
| 422 | `IDEMPOTENCY_KEY_REUSED` |
| 500 | `INTERNAL_ERROR` |
| 503 | `DATABASE_BUSY` (tunggu koneksi atau lock lewat batas), `DATABASE_UNAVAILABLE` |

## Data demo

Mengisi beberapa event fiktif dan pesanan dalam setiap status, lewat logika bisnis asli (bukan menulis baris langsung), sehingga semua invariant tetap OK. Stack harus sudah berjalan, dan Node.js 22 diperlukan di mesin host.

```bash
npm --prefix api ci
DATABASE_URL=postgres://quotient:quotient@localhost:5433/quotient npm --prefix api run demo-data
```

Login demo: organizer `organizer@quotient.local` / `organizer-demo-pass`, pembeli `pembeli1@quotient.local` sampai `pembeli12@quotient.local` / `pembeli-demo-pass`.

## Bukti: 200 pembeli, kuota 100

Uji ini menjawab pertanyaan utama proyek: apakah kuota bisa terjual lebih kalau banyak orang memesan di detik yang sama?

```bash
npm --prefix api ci
node tools/demo.mjs
```

Dua perintah ini membutuhkan Docker dan Node.js 22 (`npm ci` memasang `tsx`, yang dipakai invariant checker). Skrip menarik image k6 saat pertama kali jalan dan menjalankan urutan lengkap dua kali, sekali dengan strategi `naive` lalu dengan `atomic`. Setiap fase memakai database yang baru di-reset, di compose project terpisah (`quotient-demo`, port 3100 dan 5434), jadi stack dev tidak tersentuh. Urutannya:

1. Reset database.
2. Seed satu event (Reguler kuota 100) dan 200 akun pembeli.
3. k6 mengirim 200 `POST /orders` (masing-masing 1 tiket) bersamaan.
4. Invariant checker membandingkan counter kuota dengan isi tabel pesanan.

Strategi `naive` membaca sisa kuota ke aplikasi lalu menulis nilai baru, sehingga rentan *lost update*. Demo memakai `NAIVE_RACE_DELAY_MS=30`, jeda di antara baca dan tulis yang meniru logika aplikasi di antara pengecekan dan penulisan. Jeda ini tidak menciptakan bug, hanya membuat bug yang sudah ada muncul di setiap run. Strategi `atomic` tidak terpengaruh.

### Hasil

Empat run berturut-turut pada 19 November 2026, masing-masing dengan database yang di-reset:

| Run | Strategi | 201 | 409 `QUOTA_EXHAUSTED` | Lain | `reserved` | Pesanan aktif | Invariant |
|---|---|---|---|---|---|---|---|
| 1 | naive | 200 | 0 | 0 | 24 | 200 | LANGGAR |
| 1 | atomic | **100** | 100 | 0 | 100 | 100 | OK |
| 2 | naive | 200 | 0 | 0 | 17 | 200 | LANGGAR |
| 2 | atomic | **100** | 100 | 0 | 100 | 100 | OK |
| 3 | naive | 200 | 0 | 0 | 20 | 200 | LANGGAR |
| 3 | atomic | **100** | 100 | 0 | 100 | 100 | OK |
| 4 | naive | 200 | 0 | 0 | 22 | 200 | LANGGAR |
| 4 | atomic | **100** | 100 | 0 | 100 | 100 | OK |

Run 4 dijalankan setelah perbaikan dari code review, pada kode final.

Yang terlihat:

- **Atomic tepat 100 terjual di setiap run.** 100 permintaan lain ditolak dengan 409 `QUOTA_EXHAUSTED`, tidak ada error lain, dan semua pemeriksaan invariant OK. Latensi p95 1,3 sampai 2,5 detik, jauh di bawah batas tunggu 5 detik.
- **Naive meloloskan semua 200 pesanan untuk kuota 100**, sementara counter `reserved` hanya tercatat 17 sampai 24. Hampir setiap transaksi membaca angka lama lalu menimpa tulisan transaksi lain.
- **CHECK `sold + reserved <= quota` tidak menangkapnya**, karena counter justru terlalu kecil. Oversell hanya terlihat dari invariant checker, yang membandingkan kuota dengan pesanan yang benar-benar tercatat: 200 pesanan aktif untuk kuota 100, dan `reserved` 17 sampai 24 untuk 200 pesanan PENDING.

Ringkasan tiap run tersimpan di `tools/load-test/results/` (di-gitignore). Langkah-langkahnya bisa dijalankan satu per satu terhadap stack dev (seed 200 pembeli, k6 lewat Docker, lalu invariant checker), lihat [tools/load-test/README.md](tools/load-test/README.md).

### Invariant checker

```bash
DATABASE_URL=postgres://quotient:quotient@localhost:5433/quotient npm --prefix api run invariants
```

Memeriksa enam hal: `reserved` dan `sold` sesuai dengan pesanan PENDING dan PAID, jumlah tiket sama dengan `sold`, counter dan pesanan aktif tidak melebihi kuota, dan tidak ada pembeli dengan lebih dari 4 tiket aktif per event. Exit code 0 kalau semua OK dan 1 kalau ada yang LANGGAR. Organizer bisa melihat laporan yang sama di `GET /admin/invariants`.

## CI/CD dan image

GitHub Actions ([.github/workflows/ci.yml](.github/workflows/ci.yml)):

- **`test`**: di setiap push dan pull request. Menjalankan pemeriksaan tipe (`tsc`) dan seluruh test dengan Testcontainers di Postgres asli.
- **`web`**: di setiap push dan pull request. Menjalankan typecheck dan build frontend (frontend belum punya test).
- **`build-and-push`**: hanya pada push ke `main`, setelah `test` dan `web` lulus. Membangun image API dan mendorongnya ke GitHub Container Registry.

Image ada di `ghcr.io/fabverse0/quotient-ticketing`, dengan dua tag: `sha-<7 karakter commit>` (tag yang tidak berubah, untuk menunjuk versi tertentu) dan `latest`.

```bash
docker pull ghcr.io/fabverse0/quotient-ticketing:sha-<short-sha>
```

Daftar tag ada di halaman Packages repositori ini di GitHub.

## Dokumentasi lain

- [DECISIONS.md](DECISIONS.md): alasan tiap keputusan desain, cara sistem ini dibuktikan benar, dan batasan yang diakui.
- [DESIGN.md](DESIGN.md): arah desain frontend (palet, tipografi, komponen, animasi).
- [docs/diagrams/](docs/diagrams): [ERD](docs/diagrams/erd.md), [state machine pesanan](docs/diagrams/order-state.md), [alur pembuatan pesanan](docs/diagrams/order-sequence.md), [alur webhook](docs/diagrams/webhook-sequence.md), dan [arsitektur](docs/diagrams/architecture.md).
- [docs/RESEARCH.md](docs/RESEARCH.md): riset di awal proyek.
