# Quotient (quotient-ticketing)

Final Project Back-End Intermediate (Veterantech). API penjualan tiket event dengan kuota terbatas.
Deadline: Sabtu 21 November 2026, 23:59 WIB. Demo: Minggu 22 November 2026, 13:00 WIB.

Nama "Quotient" berarti hasil bagi: kuota yang terbatas dibagi tepat ke banyak pembeli, tidak lebih satu pun.

## Cara bekerja di repo ini

- Pemilik proyek (Fab) yang memegang keputusan desain. Kalau ada keputusan yang belum tertulis di sini atau di DECISIONS.md, tanyakan dulu, jangan menebak.
- Setiap selesai satu modul, jelaskan konsep dan alur transaksinya dengan bahasa sederhana. Fab harus bisa menjelaskan ulang saat tanya jawab.
- DECISIONS.md ditulis oleh Fab. Boleh bantu merapikan, tapi jangan mengarang alasan.
- Bahasa dokumentasi: Indonesia yang natural. Kode, nama variabel, dan pesan commit dalam bahasa Inggris.

## Aturan commit dan PR

- Satu branch per modul (`feat/app-foundation`, `feat/orders`, `feat/payments`, ...), satu PR per modul. Jangan push pekerjaan modul langsung ke `main`.
- Atomic commit: satu commit berisi satu perubahan logis yang utuh. Jangan memecah commit hanya supaya jumlahnya banyak.
- Verifikasi per commit cukup typecheck (`npx tsc -p .` di `api/`), dan harus lulus di setiap commit. Test lengkap dijalankan sekali di commit terakhir sebelum push. CI di GitHub menjalankan test di setiap push sebagai jaring pengaman tambahan.
- Format Conventional Commits dengan scope: `feat(config): validate env with zod`. Tipe yang dipakai: feat, fix, chore, test, docs, refactor. Pesan commit dalam bahasa Inggris.
- Fab yang merge PR, dengan **rebase merge** (bukan squash) supaya setiap commit atomic tetap ada di `main`. Claude tidak merge PR.

## Stack

| Lapisan | Pilihan |
|---|---|
| Runtime | Node.js + TypeScript |
| HTTP | Hono |
| Validasi | Zod |
| Database | PostgreSQL (satu satunya sumber kebenaran) |
| Query | Drizzle. Query inti kuota ditulis sebagai raw SQL |
| Migrasi | drizzle-kit |
| Job kedaluwarsa | Sweeper berkala (setTimeout berantai), tanpa pg-boss |
| Auth | JWT (peran buyer dan organizer) |
| Real time | SSE + Postgres LISTEN/NOTIFY |
| Test | Vitest + Testcontainers (Postgres asli, bukan mock) |
| Uji beban | k6 |
| Frontend | React + Vite + TanStack Query + Tailwind |
| Proxy | Nginx (opsional, dipakai jika frontend + 2 replika jadi) |
| CI/CD | GitHub Actions, image ke GHCR dengan tag commit SHA |

Tidak memakai Redis. Tidak memakai microservice. Supabase hanya opsional untuk deploy Postgres, bukan untuk lokal.

## Aturan bisnis (wajib benar)

1. Event punya dua tipe tiket: Reguler dan VIP, masing masing dengan kuota dan harga sendiri.
2. Pembeli bisa melihat event dan sisa kuota tiap tipe.
3. Pesanan 1 sampai 4 tiket, status PENDING, menahan kuota 15 menit. Lewat 15 menit tanpa bayar: EXPIRED dan kuota kembali.
4. Maksimal 4 tiket per pembeli per event, dihitung dari pesanan PENDING dan PAID.
5. Pembeli bisa membatalkan pesanan sebelum bayar. Kuota langsung kembali.
6. Pembayaran disimulasikan (endpoint) dan ada versi webhook.
7. Pembayaran berhasil menerbitkan tiket dengan kode unik. Satu pesanan tidak boleh menerbitkan tiket dua kali.
8. Pembeli bisa melihat riwayat pesanan dan tiketnya.

## Prinsip menjaga kebenaran

- Kuota dipotong dengan atomic conditional update di dalam transaksi yang sama dengan pembuatan pesanan.
- `CHECK (sold + reserved <= quota)` di tabel tipe tiket sebagai pengaman terakhir.
- Kuota habis dideteksi dari atomic update yang mengembalikan 0 baris, itu jalur normal. Kalau constraint `ticket_types_capacity` yang menolak, itu bug di kode, bukan kuota habis biasa. Klien tetap menerima 409 `QUOTA_EXHAUSTED`, tapi server mencatatnya sebagai error dengan pesan "capacity guard triggered". Drizzle membungkus error pg, nama constraint ada di `error.cause.constraint`.
- Batas 4 tiket dijaga dengan `pg_advisory_xact_lock` per (buyer_id, event_id).
- Transisi status selalu `UPDATE ... WHERE id = $1 AND status = 'PENDING' RETURNING`. Hanya pemenang yang menerbitkan tiket atau mengembalikan kuota.
- `UNIQUE` di tabel tiket untuk mencegah penerbitan ganda.
- Kode tiket acak dari crypto, bukan berurutan.
- Pembayaran untuk pesanan yang sudah lewat `expires_at` ditolak, walaupun sweeper belum jalan.
- Waktu "sekarang" diambil lewat abstraksi `clock` supaya test kedaluwarsa tidak menunggu 15 menit.

## Keputusan yang sudah ditetapkan

- Satu pesanan hanya satu tipe tiket (kolom `ticket_type_id` di `orders`, tanpa `order_items`).
- Format error konsisten: `{ "error": { "code": "QUOTA_EXHAUSTED", "message": "..." } }`.
- Simulasi bayar ada di halaman pembeli, endpoint hanya aktif di mode development.
- Webhook yang datang setelah pesanan kedaluwarsa: ditolak, pesanan ditandai `REFUND_REQUIRED`.
- Sweeper berjalan tiap 30 detik (nilai dari env).
- Deploy online opsional, dikerjakan paling akhir.
- Akun organizer dibuat lewat seed, bukan lewat halaman daftar.

## Fakta teknis yang sudah ada di kode

Fondasi:
- `createApp({ db, clock, auth })` menerima semua dependensi dari luar. `index.ts` memberi `systemClock` dan config asli; test memberi DB Testcontainers, `createFakeClock`, dan `testAuthSettings`, lalu memanggil `app.request()` tanpa server. Modul baru ikut pola ini: `createXService({ db, clock? })` dirakit di `createApp`.
- Lapisan per modul: `handler` (HTTP), `schemas` (Zod), `service` (batas transaksi), `queries` (SQL), `views` (bentuk respons). Fungsi query menerima `Executor` (`Database | Transaction`) supaya bisa dipanggil di dalam transaksi.
- Body dan param divalidasi lewat `parseJsonBody` / `parseParams` di `shared/validation.ts`. JSON rusak 400 `INVALID_JSON`, gagal Zod 400 `VALIDATION_ERROR`.
- Kode error yang sudah dipakai: `VALIDATION_ERROR`, `INVALID_JSON`, `UNAUTHORIZED`, `INVALID_TOKEN`, `INVALID_CREDENTIALS`, `FORBIDDEN`, `EMAIL_TAKEN`, `EVENT_NOT_FOUND`, `NOT_FOUND`, `DATABASE_UNAVAILABLE` (503 dari `/health`), `INTERNAL_ERROR`.
- Migrasi dijalankan programatik lewat drizzle migrator (`dist/migrate.js`), karena `drizzle-kit` hanya devDependency dan tidak ada di image produksi. Service `api` di compose menjalankan migrasi saat start.
- Skema awal sudah memuat `orders`, `tickets`, `idempotency_keys`, `processed_events`. FK komposit `orders(ticket_type_id, event_id) -> ticket_types(id, event_id)` menjamin tipe tiket milik event yang sama. Tiap status akhir punya CHECK kolom waktunya (`paid_at`, `cancelled_at`, dst).

Auth:
- `bcryptjs` (JS murni, algoritma bcrypt sama), bukan `bcrypt` native, supaya image Alpine dan CI tidak butuh toolchain build. Cost 10. Password maksimal 72 byte karena bcrypt diam diam memotong sisanya.
- Email `citext` (unik tanpa beda huruf besar kecil). Duplikat dideteksi lewat `ON CONFLICT DO NOTHING`, bukan menangkap error pg.
- Register selalu membuat buyer; field `role` dari klien diabaikan.
- Login dengan email tidak dikenal dan password salah memberi respons identik (401 `INVALID_CREDENTIALS`), dan waktu hash dijaga mirip lewat dummy hash.
- JWT HS256, klaim `user_id`, `role`, `iat`, `exp`. `exp` wajib karena Hono hanya memeriksa kedaluwarsa kalau klaim itu ada. `JWT_SECRET` minimal 32 karakter, `JWT_EXPIRES_IN` berformat `30m` / `1h` / `7d`.
- Tanpa token atau token rusak 401, peran salah 403. `GET /auth/me` menolak 401 kalau akun pemilik token sudah tidak ada.
- Seed organizer jalan setiap API start: idempotent, aman dari beberapa replika sekaligus, tidak menimpa password akun yang sudah ada, gagal kalau email itu milik buyer. `ORGANIZER_EMAIL` dan `ORGANIZER_PASSWORD` harus diisi berpasangan.

Events:
- Event dan kedua tipe tiketnya dibuat dalam satu transaksi. Wajib tepat dua tipe: satu REGULAR, satu VIP.
- Harga dan kuota bilangan bulat 0 ke atas (0 boleh). Batas atas harga 100.000.000 dan kuota 1.000.000, supaya harga x 4 tiket tetap muat di kolom `integer` Postgres (`total_price`).
- Endpoint publik hanya menampilkan `remaining = quota - sold - reserved`. `quota`, `sold`, `reserved`, dan `organizerId` hanya muncul di `GET /organizer/events/:id`.
- Organizer bukan pemilik mendapat 403, bukan 404, karena keberadaan event sudah publik lewat `GET /events/:id`. Event yang tidak ada 404 `EVENT_NOT_FOUND`. Id bukan uuid 400 `VALIDATION_ERROR`.
- `GET /events` memuat semua event (termasuk yang sudah lewat), urut `startsAt` naik, tanpa paginasi. Event tidak harus di masa depan saat dibuat.

Orders:
- Body `POST /orders` memakai camelCase (`ticketTypeId`, `quantity`), konsisten dengan modul events.
- Urutan di transaksi buat pesanan: lock dan cek Idempotency-Key, baca tipe tiket dan event, cek event belum dimulai, advisory lock (buyer, event), hitung tiket aktif, potong kuota, insert order, insert key. Baris `ticket_types` disentuh paling akhir karena lock barisnya dipegang sampai commit.
- Transaksi memakai READ COMMITTED (default). Jangan dinaikkan ke REPEATABLE READ: snapshot akan diambil sebelum advisory lock, sehingga hitungan tiket aktif tidak melihat pesanan pemegang lock sebelumnya dan batas 4 tiket jebol.
- Advisory lock: `hashtextextended(buyer_id::text || ':' || event_id::text, 0)` untuk batas 4 tiket, `hashtextextended('idem:' || buyer_id || ':' || key, 0)` untuk Idempotency-Key.
- PENDING yang sudah lewat `expires_at` tapi belum disapu sweeper tetap dihitung ke batas 4.
- Event dengan `starts_at <= clock.now()` ditolak 409 `EVENT_ALREADY_STARTED`.
- `created_at` dan `expires_at` diisi dari `clock`, bukan `now()` database, supaya selisihnya tepat 15 menit dan test dengan fake clock konsisten.
- Strategi kuota dipilih lewat `QUOTA_STRATEGY` dan masuk ke `createApp({ quotaStrategy })` sebagai dependensi opsional (default `atomic`). Naive membaca counter lalu menulis nilai absolut, sengaja rentan lost update. Oversell-nya tidak tertangkap CHECK karena counter tetap terlihat valid, hanya terlihat dari `reserved` dibanding `SUM(quantity)` pesanan PENDING.
- Pengembalian kuota (cancel, nanti expire) selalu relatif (`reserved = reserved - q`) di strategi apa pun.
- Idempotency-Key opsional (1 sampai 255 karakter), unik per buyer. `request_hash` adalah sha256 dari body yang sudah di-parse dengan urutan field tetap. Body sama: pesanan lama dengan 200. Body beda: 422 `IDEMPOTENCY_KEY_REUSED`. Key disimpan di transaksi yang sama dengan pesanan, jadi request yang gagal tidak menyimpan key dan retry diproses ulang. Replay tetap jalan walaupun event sudah dimulai.
- Cancel memakai `UPDATE ... WHERE id AND buyer_id AND status = 'PENDING' AND expires_at > now RETURNING`, lalu mengurangi `reserved` hanya kalau dapat baris. Kalau tidak dapat baris: tidak ada atau milik orang lain 404 `ORDER_NOT_FOUND`, masih PENDING (berarti lewat `expires_at`) 409 `ORDER_EXPIRED` dan dibiarkan untuk sweeper, status lain 409 `ORDER_NOT_PENDING`.
- Pesanan orang lain di `GET /orders/:id` dan cancel mendapat 404, bukan 403, karena keberadaan pesanan bersifat privat. `GET /orders` urut `created_at` turun, tanpa paginasi.
- Semua route `/orders` hanya untuk buyer; organizer 403.
- Kode error baru: `TICKET_TYPE_NOT_FOUND`, `ORDER_NOT_FOUND`, `EVENT_ALREADY_STARTED`, `BUYER_LIMIT_EXCEEDED`, `QUOTA_EXHAUSTED`, `ORDER_NOT_PENDING`, `ORDER_EXPIRED`, `IDEMPOTENCY_KEY_REUSED` (422).

Payments:
- Satu fungsi `markOrderPaid(tx, orderId, now, buyerId?)` dipakai simulasi bayar dan webhook: `UPDATE orders SET status = 'PAID' WHERE id AND status = 'PENDING' AND expires_at > now RETURNING`. Hanya pemenang yang memindahkan `reserved` ke `sold` (relatif, `sold + reserved` tetap) dan menerbitkan tiket seq 1..q. Kalau kalah, status dibaca ulang: tidak ada `NOT_FOUND`, PAID `ALREADY_PAID` beserta tiket lama, selain itu `NOT_PAYABLE` dengan statusnya (PENDING berarti lewat `expires_at` tapi belum disapu).
- `POST /orders/:id/pay` hanya didaftarkan kalau `createApp({ simulatedPaymentEnabled })` true. `loadConfig` mengisinya `NODE_ENV !== 'production'`; default `createApp` false. Bayar dua kali: 200 dengan pesanan dan tiket yang sama (retry setelah respons hilang), tanpa penerbitan ulang. Lewat `expires_at` atau EXPIRED 409 `ORDER_EXPIRED`, CANCELLED/REFUND_REQUIRED 409 `ORDER_NOT_PENDING`, milik orang lain 404.
- `POST /webhooks/payment` tanpa JWT, hanya didaftarkan kalau `paymentWebhookSecret` diberikan. Body dibatasi 64 KB (413 `PAYLOAD_TOO_LARGE`) sebelum dibaca. Header `X-Signature` berisi HMAC-SHA256 hex (huruf besar boleh) dari byte body mentah (`c.req.arrayBuffer()`), dicek formatnya dengan regex lalu dibandingkan `timingSafeEqual`. Gagal 401 `INVALID_SIGNATURE`. JSON rusak 400 `INVALID_JSON`, payload tidak valid 400 `VALIDATION_ERROR`; keduanya tidak dicatat.
- Payload snake_case: `event_id`, `event_type` (`payment.succeeded` | `payment.failed`), `order_id` (uuid), `amount`.
- `event_type` lain hanya wajib punya `event_id` dan `event_type` (string 1 sampai 255). Event itu dicatat dengan outcome `IGNORED` dan `order_id` NULL, tidak menyentuh pesanan, dan dibalas 200 supaya penyedia berhenti mengirim ulang. Tipe yang dikenal tetap divalidasi penuh (400 kalau tidak valid).
- Urutan di transaksi webhook: `INSERT processed_events ... ON CONFLICT (event_id) DO NOTHING RETURNING` paling awal sebagai gerbang dedupe (salinan yang datang bersamaan menunggu di primary key). Duplikat: 200 `{ duplicate: true, outcome }` dengan outcome yang tersimpan. Kalau payload duplikat berbeda dari yang tersimpan, tetap diperlakukan sebagai duplikat tapi dicatat dengan `console.warn`. Perbandingannya jsonb, jadi urutan key dan spasi tidak dihitung berbeda. `order_id` diisi lewat subquery, NULL kalau pesanan tidak ada (FK tetap aman).
- Kolom `processed_events.outcome` (enum `webhook_outcome`): `PAID`, `ALREADY_PAID`, `REFUND_REQUIRED`, `ALREADY_REFUND_REQUIRED`, `AMOUNT_MISMATCH`, `ORDER_NOT_FOUND`, `PAYMENT_FAILED`, `IGNORED`. NULL hanya di antara insert dan akhir transaksi yang sama. Semua event yang tercatat dibalas 200 `{ received, duplicate, outcome }`.
- Amount tidak sama dengan `total_price`: outcome `AMOUNT_MISMATCH`, pesanan tetap PENDING, `console.error`, 200. `payment.failed`: outcome `PAYMENT_FAILED`, tidak mengubah apa pun.
- `payment.succeeded` setelah waktu tahan: PENDING yang lewat `expires_at` diubah ke REFUND_REQUIRED dengan `WHERE status = 'PENDING' AND expires_at <= now` dan `reserved` dikembalikan di transaksi itu (sweeper tidak akan menyentuhnya lagi). EXPIRED/CANCELLED diubah dengan `WHERE status IN ('EXPIRED', 'CANCELLED')` tanpa menyentuh kuota. Dua UPDATE terpisah ini yang menjamin webhook terlambat dan sweeper yang bersamaan hanya mengembalikan kuota sekali.
- `PAYMENT_WEBHOOK_SECRET` wajib, minimal 32 karakter, di semua `NODE_ENV`.
- Batasan yang diakui: payload berisi `\u0000` ditolak Postgres saat disimpan ke kolom jsonb, sehingga dibalas 500 dan penyedia akan mengirim ulang. Tidak diperbaiki.
- Kode error baru: `INVALID_SIGNATURE` (401), `PAYLOAD_TOO_LARGE` (413).

Tickets:
- Kode tiket `randomBytes(12).toString('base64url')`: 16 karakter, 96 bit, tidak berurutan. `issued_at` dari `clock`.
- `GET /tickets` (buyer saja): semua tiket pembeli beserta `orderId`, event (id, title, venue, startsAt), dan tipe tiket, urut `issued_at` turun lalu `seq`. `GET /orders/:id` membawa `tickets` (kosong kalau belum PAID); `GET /orders` tidak.

Sweeper:
- `sweepExpiredOrders(db, now, batchSize = 100)` di `api/src/jobs/sweeper.ts` mengembalikan jumlah pesanan yang di-expire. Bisa dipanggil langsung dari test dengan waktu dari fake clock.
- Satu batch satu transaksi: `UPDATE orders SET status = 'EXPIRED' WHERE status = 'PENDING' AND id IN (SELECT ... WHERE status = 'PENDING' AND expires_at <= now ORDER BY expires_at LIMIT n FOR UPDATE SKIP LOCKED)`, lalu `reserved` dikembalikan relatif per tipe tiket, digabung dengan `SUM(quantity)` dan diurutkan berdasarkan `ticket_type_id`. Batch diulang sampai hasilnya lebih kecil dari ukuran batch.
- Guard PENDING yang menahan beban ada di subselect yang mengunci. Kalau dihapus dari situ, subselect mengambil baris non-PENDING, UPDATE menyaringnya, batch jadi pendek, dan loop berhenti sebelum semua pesanan jatuh tempo diproses. Guard di UPDATE adalah pengulangan.
- `SKIP LOCKED` menjaga kelancaran, bukan kebenaran: baris yang sedang dipegang bayar, cancel, webhook, atau sweeper lain dilewati sampai putaran berikutnya. Tanpa `SKIP LOCKED`, angka kuota tetap benar karena guard PENDING, tetapi sweeper ikut tertahan.
- Batas waktunya `expires_at <= now`, kebalikan tepat dari bayar dan cancel (`expires_at > now`). Untuk satu nilai `now`, pesanan hanya bisa bayar/batal atau di-expire, tidak keduanya.
- Jadwal memakai `setTimeout` berantai: putaran berikutnya dijadwalkan setelah putaran sebelumnya selesai, jadi tidak pernah tumpang tindih di satu instance. Putaran pertama langsung saat start. Putaran yang gagal (termasuk throw sinkron) dicatat dengan `console.error`, jadwal tetap jalan.
- `SWEEPER_ENABLED` (default true) dan `SWEEPER_INTERVAL_MS` (default 30000, 1000 sampai 3600000). Sweeper dijalankan dari `index.ts`, bukan `createApp`, jadi test HTTP tidak pernah menjalankan timer. Saat shutdown sweeper dihentikan (menunggu putaran yang sedang jalan) sebelum `server.close`.
- Setiap instance API menjalankan sweeper sendiri; `SKIP LOCKED` membuat mereka membagi baris, tidak menggandakan pengembalian.
- Tidak memakai pg-boss: `schedule()` pg-boss mengevaluasi jadwal tiap 30 detik dan mengirim paling banyak satu job per menit (dokumentasinya: "sends at most one job a minute"), jadi interval 30 detik tidak bisa dipenuhi tanpa merakit sendiri lewat `send` dengan `startAfter`. Jaminan utamanya (job tidak dikerjakan dua kali) sudah diberikan `SKIP LOCKED` dan guard PENDING, sementara pg-boss menambah dependency, skema `pgboss` dengan migrasinya sendiri, dan pool koneksi kedua. Retry tidak dibutuhkan karena putaran berikutnya mengulang pekerjaan yang sama dengan aman.

Urutan lock (wajib untuk payments dan sweeper):
- Baris `orders` dulu, baru `ticket_types`. Cancel sudah begitu. Buat pesanan menyentuh `ticket_types` sebelum insert order, tapi baris order itu baru dan tidak bisa diperebutkan.
- Sweeper yang memproses banyak pesanan sekaligus mengurutkan update `ticket_types` berdasarkan `id`, supaya dua sweeper atau sweeper dan transaksi lain tidak saling menunggu dalam lingkaran (deadlock).

Test:
- Token ditandatangani dengan fake clock tapi diverifikasi Hono dengan waktu asli, dan token dengan `iat` di masa depan ditolak. Fake clock dimulai dari waktu asli dan di-reset di `beforeEach`; token dibuat sebelum clock dimajukan.
- `tests/helpers/locks.ts` `raceBehindLock(db, lockSql, attempts)` memaksa interleaving terburuk: penahan mengunci, semua percobaan ditunggu sampai tertahan (`pg_stat_activity`), lalu dilepas. Jumlah percobaan maksimal ukuran pool test (5) dikurangi dua.
- `holdLock(db, lockSql)` memegang lock sampai `release()`. `stageBehindLock(db, lockSql, blocked, whileBlocked?)` memulai tiap langkah `blocked` setelah langkah sebelumnya tertahan, sehingga urutan pengambilan lock baris pasti, lalu menjalankan `whileBlocked` yang harus selesai tanpa menunggu (gagal setelah 2 detik). Dipakai untuk race dengan sweeper, karena dengan `SKIP LOCKED` sweeper tidak pernah tertahan di baris pesanan: race webhook terlambat vs sweeper diuji dua arah (webhook memegang pesanan duluan, atau sweeper duluan).
- `tests/quota-strategy.test.ts` membuktikan lost update secara deterministik: transaksi penahan mengunci baris, dua reservasi berjalan sampai tertahan di UPDATE (sudah membaca), lalu penahan dilepas. Kuota 1: atomic meloloskan satu, naive meloloskan dua dengan `reserved = 1`.

Lingkungan lokal dan CI:
- Postgres compose dibuka di port host 5433, karena 5432 sering dipakai Postgres lokal. Di dalam jaringan compose API tetap memakai `postgres:5432`.
- Compose punya `JWT_SECRET` dan `PAYMENT_WEBHOOK_SECRET` default khusus dev supaya `docker compose up` jalan di clone bersih. Jangan dipakai di luar lokal.
- Image API multi-stage dan berjalan sebagai user non-root `node`.
- CI: job `test` (typecheck + Testcontainers) di setiap push dan PR; `build-and-push` ke `ghcr.io/fabverse0/quotient-ticketing` hanya dari push ke `main`, tag `sha-<short>` dan `latest`.

## Nilai tambah yang direncanakan

1. Strategi kuota `QUOTA_STRATEGY=naive|atomic` untuk membuktikan versi naif bisa oversell.
2. Header `Idempotency-Key` di endpoint buat pesanan.
3. Invariant checker (skrip dan endpoint admin).
4. Simulator penyedia pembayaran dengan mode kacau (webhook ganda, terlambat, tidak berurutan).
5. Uji 200 pesanan paralel untuk kuota 100, hasil tepat 100 terjual.

## Struktur repo

```
quotient-ticketing/
├── README.md
├── DECISIONS.md
├── CLAUDE.md
├── docker-compose.yml
├── .env.example
├── .github/workflows/ci.yml
├── api/
│   ├── Dockerfile
│   ├── migrations/
│   ├── src/
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   ├── events/
│   │   │   ├── orders/      (handler, service, queries, strategy)
│   │   │   ├── payments/
│   │   │   └── tickets/
│   │   ├── jobs/
│   │   ├── realtime/
│   │   └── shared/          (db, config, errors, clock)
│   └── tests/
├── web/
├── nginx/                   (opsional)
├── tools/
│   ├── load-test/
│   ├── invariant-check/
│   └── payment-simulator/
└── docs/
    ├── RESEARCH.md
    └── diagrams/
```

Batas transaksi ada di `service`. Handler hanya urusan HTTP. Query penting ada di `queries`.

## Prioritas

1. Skema DB, modul orders (pesan, batal, batas 4 tiket), events, tickets
2. Kedaluwarsa, test wajib (alur pesan sampai tiket, kuota habis, kedaluwarsa)
3. Docker Compose satu perintah, CI/CD ke GHCR
4. Uji 200 paralel (k6), strategi naive vs atomic, invariant checker
5. Webhook idempoten, Idempotency-Key
6. Frontend (pembeli + dashboard organizer), SSE
7. Nginx + 2 replika, simulator kacau, deploy
8. README, DECISIONS.md, diagram, latihan demo

## Skill dan plugin

Plugin proyek (terdaftar di `.claude/settings.json`):

| Plugin | Kapan dipakai |
|---|---|
| context7 | Selalu cek dokumentasi lewat Context7 sebelum memakai API Hono, Drizzle, pg-boss, Zod, atau Testcontainers. Jangan menulis API dari ingatan |
| typescript-lsp | Sepanjang proyek, untuk diagnostik tipe yang nyata |
| superpowers | Pakai skill TDD untuk test wajib dan systematic debugging saat mentok. Tidak perlu menjalankan seluruh alur brainstorming untuk tugas kecil |
| code-review | Di akhir setiap modul, terutama orders dan payments |

Antislop (mode during):
- antislop-code di akhir setiap modul untuk membersihkan komentar khas AI tanpa mengubah kode
- antislop-ui dan antislop-human saat mengerjakan frontend. Siapkan `DESIGN.md` dulu sebelum mulai frontend

Opsional: Postgres best practices (Supabase agent skills) saat menulis migrasi, Playwright setelah frontend jadi.

Mekanisme keamanan dan pembuktian (CHECK constraint, advisory lock, strategi naive, invariant checker, Idempotency-Key) adalah kebutuhan, bukan kode berlebih. Jangan disederhanakan.

Diagram ditulis dalam Mermaid di `docs/diagrams/`. Setelah migrasi final, cocokkan ERD dengan file migrasi.
