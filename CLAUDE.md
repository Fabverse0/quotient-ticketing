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
| Proxy | Nginx di container web (satu origin dan SSE). Dua replika API belum dikerjakan |
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
- Kode error yang sudah dipakai: `VALIDATION_ERROR`, `INVALID_JSON`, `UNAUTHORIZED`, `INVALID_TOKEN`, `INVALID_CREDENTIALS`, `FORBIDDEN`, `EMAIL_TAKEN`, `EVENT_NOT_FOUND`, `NOT_FOUND`, `DATABASE_UNAVAILABLE` (503 dari `/health`), `DATABASE_BUSY` (503, tunggu koneksi atau lock lewat batas), `INTERNAL_ERROR`.
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
- `NAIVE_RACE_DELAY_MS` (default 0, 0 sampai 1000) menambah jeda di antara baca dan tulis counter, **hanya di strategi naive**, untuk meniru logika aplikasi di antara pengecekan dan penulisan. Jeda ini tidak menciptakan bug; lost update sudah ada tanpa jeda, jeda hanya membuatnya muncul di setiap run alih-alih bergantung pada keberuntungan timing. Atomic tidak pernah menerima jeda (`createQuotaStrategy` hanya meneruskannya ke naive), dan test memastikan request atomic tetap selesai jauh di bawah jedanya. Demo memakai 30 ms.
- Pengembalian kuota (cancel, sweeper, dan webhook terlambat) selalu relatif (`reserved = reserved - q`) di strategi apa pun.
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
- Batasan yang diakui: mode `QUOTA_STRATEGY=naive` sengaja merusak invariant `reserved` (bisa lebih kecil dari jumlah pesanan PENDING), sehingga sweeper bisa macet. Pengembalian kuota membuat `reserved` negatif, `ticket_types_reserved_nonneg` menolak, batch di-rollback, dan karena batch diurutkan `expires_at` baris yang sama selalu di depan, jadi pesanan event lain ikut tidak di-expire. Dibiarkan sebagai efek mode demo, tanpa savepoint per tipe tiket. Demo naive harus memakai database yang di-reset sebelum demo atomic.
- Tidak memakai pg-boss: `schedule()` pg-boss mengevaluasi jadwal tiap 30 detik dan mengirim paling banyak satu job per menit (dokumentasinya: "sends at most one job a minute"), jadi interval 30 detik tidak bisa dipenuhi tanpa merakit sendiri lewat `send` dengan `startAfter`. Jaminan utamanya (job tidak dikerjakan dua kali) sudah diberikan `SKIP LOCKED` dan guard PENDING, sementara pg-boss menambah dependency, skema `pgboss` dengan migrasinya sendiri, dan pool koneksi kedua. Retry tidak dibutuhkan karena putaran berikutnya mengulang pekerjaan yang sama dengan aman.

Pool dan batas waktu:
- `DB_POOL_MAX` tetap 10. Saat 200 request berebut satu baris `ticket_types`, koneksi tambahan tidak menambah throughput, hanya memindahkan antrean dari pool Node ke antrean lock Postgres sambil memakan `max_connections` (default 100, perlu ruang untuk 2 replika, sweeper, dan tools).
- `DB_CONNECTION_TIMEOUT_MS` (default 5000, 100 sampai 60000) membatasi tunggu koneksi bebas dari pool; default pg 0 berarti menunggu selamanya. `DB_LOCK_TIMEOUT_MS` (default 5000) diset sebagai `lock_timeout` Postgres untuk tunggu lock baris dan advisory lock. `idle_in_transaction_session_timeout` 10 detik (konstanta) membunuh transaksi yang ditinggal terbuka supaya lock baris panas tidak tertahan selamanya.
- Keduanya dipetakan ke 503 `DATABASE_BUSY` di error handler: kode pg `55P03` (`lock_not_available`) atau pesan pg-pool "timeout exceeded when trying to connect", dicari di rantai `cause` karena Drizzle membungkus error pg. Dicatat dengan `console.warn` (kode dan pesan saja), bukan error.
- `pool.on("error")` hanya menangkap error koneksi idle; `pg-pool` melepas listener-nya saat koneksi dipinjam. Karena itu `createDatabase` memasang listener `error` di setiap client lewat `pool.on("connect")`. Tanpa itu, sesi yang diputus Postgres di tengah transaksi (idle-in-transaction timeout, restart) mematikan proses. Dengan itu, query yang sedang jalan gagal (500) dan pool membuang client-nya. Diuji di `tests/db-connection-loss.test.ts` dengan `pg_terminate_backend`.
- `migrate.ts` membuat pool dengan `dbLockTimeoutMs: 0` (pg tidak mengirim `lock_timeout`, Postgres memakai default tanpa batas), supaya migrasi yang menunggu migrasi replika lain atau transaksi panjang tetap menunggu, tidak gagal dan membuat API tidak bisa start.
- Di run k6 sungguhan (atomic), latensi p95 1,3 sampai 2,5 detik, jadi batas 5 detik memberi ruang sekitar 2 kali.

Invariant checker:
- Inti di `api/src/modules/invariants/` dipakai endpoint dan CLI. Enam pemeriksaan per tipe tiket atau per (pembeli, event): `reserved` = Σ quantity PENDING, `sold` = Σ quantity PAID, jumlah tiket = `sold`, `sold + reserved <= quota`, Σ quantity PENDING + PAID <= quota, dan tidak ada pembeli dengan lebih dari 4 tiket aktif per event.
- Pemeriksaan kelima ditambahkan karena lost update naive membuat counter terlalu kecil: `sold + reserved <= quota` tetap lulus, dan hanya perbandingan dengan pesanan yang menunjukkan oversell.
- Semua pemeriksaan berjalan di satu transaksi `REPEATABLE READ` read-only, supaya write yang commit di tengah pemeriksaan tidak muncul di satu tally dan tidak di tally lain sebagai pelanggaran palsu.
- `GET /admin/invariants` khusus organizer, cakupan global (semua event), selalu 200 `{ ok, checks }`: pelanggaran adalah data, bukan request gagal.
- CLI `tools/invariant-check/check.mts` (ekstensi `.mts` karena `tools/` tidak punya `package.json` bertipe module), dijalankan `npm --prefix api run invariants [-- --json]` dengan `DATABASE_URL`. Exit code 0 OK, 1 LANGGAR, 2 tidak bisa jalan. Ikut di-typecheck oleh `tsc -p api`.

Uji beban dan demo:
- `tools/load-test/seed.mjs` membuat satu event (Reguler kuota 100) dan 200 pembeli lewat API, token disimpan ke `tools/load-test/.data/seed.json` (di-gitignore karena kredensial). Pendaftaran paralel 20 karena bcrypt.
- `tools/load-test/orders.js` (k6, image dikunci `grafana/k6:2.3.0`): executor `per-vu-iterations`, 200 VU masing-masing 1 iterasi, memanggil API di jaringan compose (`http://api:3000`). Melaporkan jumlah 201, 409 `QUOTA_EXHAUSTED`, dan status lain ke `tools/load-test/results/` (di-gitignore).
- `node tools/demo.mjs` menjalankan naive lalu atomic, masing-masing di database yang di-reset (`down -v`), di compose project terpisah `quotient-demo` (port 3100 dan 5434), sehingga stack dev dan datanya tidak tersentuh. Exit 0 hanya kalau naive oversell (pesanan dibuat melebihi kuota dan `orders_within_quota` LANGGAR), dan atomic OK dengan tepat 100 pesanan dibuat. Ringkasan run sungguhan dicatat di README.

Frontend (web/):
- Vite + React 19 + TypeScript, React Router (mode data, `createBrowserRouter` dari `react-router`, `RouterProvider` dari `react-router/dom`), TanStack Query, Tailwind v4. Tanpa library UI atau animasi.
- React Router terpasang di 7.18.x karena 8.x butuh Node 22.22 ke atas, sedangkan Node lokal 22.19. API yang dipakai sama di v7 dan v8.
- Semua nilai desain ada di `web/src/styles/tokens.css` sebagai token Tailwind `@theme` (warna, font, ukuran teks, sudut, bayangan, ukuran) dan variabel `:root` (durasi animasi, cincin fokus). Komponen hanya memakai token, tidak pernah nilai mentah.
- Kontras: ash `#aaaaaa` (2,1:1) dan ochre `#B07D2B` (3,3:1) gagal WCAG AA untuk teks kecil di latar canvas. Teks yang di DESIGN.md memakai ash memakai token `quiet` (`#666666`, 4,95:1 di wall), dan teks status ochre memakai `ochre-text` (`#8c6221`, 4,66:1 di wall). Ash dan ochre asli tetap untuk garis, border, dan elemen non-teks.
- Animasi hanya `transform` dan `opacity`, mati di `prefers-reduced-motion`, dan efek hover hanya untuk pointer sungguhan di lebar 768px ke atas.
- Satu origin: frontend selalu memanggil `/api/...`. Di container, nginx (`nginxinc/nginx-unprivileged:1.28.0-alpine`, port 8080) meneruskan `/api/` ke `http://api:3000/` dengan prefix dibuang; di development, Vite `server.proxy` melakukan hal yang sama. API tidak memakai CORS.
- Token JWT di memori dan `localStorage` (`quotient.token`), dicatat di DECISIONS.md sebagai risiko XSS. Peran diambil dari `GET /auth/me`, bukan dari decode token di browser. Respons 401 untuk token tersimpan (selain `INVALID_CREDENTIALS`) mengakhiri sesi.
- Kode error API dipetakan ke kalimat DESIGN.md di `web/src/api/errors.ts`. `VALIDATION_ERROR` dipecah per kolom dari pesan `field: pesan; field: pesan`.
- Routing per peran: belum masuk ke `/masuk`, buyer ke `/` (daftar event dari `GET /events`), organizer ke `/organizer`, peran yang salah ke halaman awal perannya. Navigasi hanya menautkan halaman yang sudah ada.
- Logo: simbol cincin berbagi empat (ekor umber) dan tulisan QUOTIENT yang sudah menjadi path, di `components/Logo.tsx` (`logoShapes.ts` dibuat dari `docs/logo/final/`). Favicon dan ikon ada di `web/public/`; di bawah 48px pakai versi kecil. Ornamen tiket (`TicketOrnament`) hanya untuk state kosong lewat `PageMessage ornament`. Aturan pakai dan lisensi font Marcellus (OFL) di `docs/logo/README.md`.
- Semua link, tab, dan tombol punya target sentuh minimal 44px; garis bawah tautan ada di `span` label, bukan di kotak yang lebih tinggi.
- Compose: service `web` di port host 8080 (`WEB_PORT`), start setelah `api` sehat. Healthcheck memakai `127.0.0.1`, karena `localhost` di container di-resolve ke IPv6 sementara nginx hanya mendengarkan IPv4. `tools/demo.mjs` hanya menyalakan `api` supaya tidak mengambil port 8080 dari stack dev.
- Screenshot dan snapshot Playwright MCP tersimpan di `.playwright-mcp/` (di-gitignore).

Frontend pembeli (web/):
- Semua tanggal dan jam tampil dalam WIB (`Asia/Jakarta`) berformat Indonesia lewat `web/src/lib/format.ts` (`formatDateTime` menambah "WIB"). Input waktu form selalu dianggap WIB (`wibInputToIso`).
- `GET /events` dan `GET /events/:id` publik, dan halaman `/` serta `/event/:id` juga publik. Tombol pesan untuk tamu membawa ke `/masuk` dengan `state.from`, dan setelah masuk pembeli kembali ke halaman itu. Organizer melihat detail event tanpa kontrol pesan.
- Respons publik event kini memuat `quota` (untuk SeatMap); rincian `sold` dan `reserved` tetap hanya untuk organizer.
- SeatMap menggambar maksimal 200 kotak; kuota lebih besar membuat satu kotak mewakili `ceil(kuota/200)` kursi, dengan keterangan "1 kotak = N kursi". Publik hanya dua keadaan (terisi, tersedia); umber untuk kursi ditahan hanya di dashboard organizer.
- Idempotency-Key dibuat sekali per percobaan pesan (`crypto.randomUUID()`), dipakai ulang hanya kalau jawabannya hilang (jaringan putus atau 503), dan dibuang setelah jawaban pasti atau saat jumlah atau tipe tiket berubah.
- Hitung mundur pesanan memakai `expires_at` dan selisih jam server: `lib/serverClock.ts` mengambil median 5 sampel dari header `Date` tiap respons (resolusi satu detik, ditambah 500 ms). Saat waktu habis tampilan langsung Kedaluwarsa dan tombol bayar hilang tanpa menunggu sweeper.
- Pembayaran simulasi: respons 404 `NOT_FOUND` dari `/orders/:id/pay` dijelaskan sebagai "hanya tersedia di mode development".
- QR memakai `uqr` 0.1.3 (sekitar 4,3 KB gzip): matriksnya digambar sendiri sebagai satu path SVG dengan warna token, bukan string SVG dari library. Isi QR adalah kode tiket. "Lot" di kartu tiket adalah 6 karakter pertama ID pesanan, "Kursi n dari m" adalah `seq` dari jumlah tiket pesanan itu.
- Data demo: `npm --prefix api run demo-data` (lihat DECISIONS.md bagian 15). Login demo: `organizer@quotient.local` / `organizer-demo-pass`, dan `pembeli1` sampai `pembeli12@quotient.local` / `pembeli-demo-pass`.

Organizer (API dan web):
- `GET /organizer/events`: event milik pemanggil beserta counter (`quota`, `sold`, `reserved`, `remaining`), urut `startsAt`. Route `/organizer/events` semuanya khusus organizer.
- `GET /organizer/events/:id/orders?limit=` (1 sampai 50, default 20, di luar itu 400): pesanan terbaru event itu, `buyerName` saja tanpa email atau id pembeli. Bukan pemilik 403, event tidak ada 404 `EVENT_NOT_FOUND`.
- `GET /organizer/events/:id/analytics`: `statuses` (kelima status selalu ada, urut state machine, dengan `orders` dan `quantity`, nol kalau kosong) dan `sales` (pesanan PAID urut `paid_at` naik: `at` ISO UTC, `kind`, `quantity`; kalau lebih dari 2.000, yang terbaru yang dipertahankan). Pemilik saja (403, 404, 400 seperti route event lain). Dipakai grafik halaman Analitik.
- `GET /admin/invariants` menerima `?eventId=` (uuid, 400 kalau bukan) yang membatasi pemeriksaan ke satu event dan hanya untuk pemiliknya (403, 404 seperti di atas). Tanpa parameter tetap global.
- Route web organizer: `/organizer` (event saya), `/organizer/event/baru` (form), `/organizer/event/:id` (dashboard). Navigasi organizer: Event saya, Buat event.
- Form buat event memvalidasi per kolom di klien (nama, tempat, waktu, harga dan kuota bilangan bulat dalam batas API) dan menganggap waktu selalu WIB.
- Dashboard: tab tipe tiket (panah kiri dan kanan berpindah, roving tabindex), empat angka Marcellus, SeatMap besar yang membedakan terjual dan ditahan, panel invariant dengan tombol manual, dan pesanan terbaru. Angka datang dari stream organizer; polling 10 detik hanya saat stream putus.
- Getar panel invariant dijalankan dari `useEffect` setelah render, karena React menulis ulang `className` saat panel berubah merah dan itu membatalkan getar yang dimulai lebih awal. Kolom grid dashboard memakai `minmax(0,1fr)` supaya isi panel tidak melebarkan trek lewat layar.

Realtime (API dan web):
- Migrasi `0003_quota_changed_notify`: trigger `ticket_types_quota_changed` (`AFTER UPDATE OF sold, reserved ... FOR EACH ROW`) memanggil `pg_notify('quota_changed', event_id)`. Terkirim hanya setelah commit; notifikasi identik dalam satu transaksi digabung Postgres.
- `api/src/realtime/`: `listener.ts` (koneksi `pg.Client` khusus di luar pool, `application_name` `quotient-realtime`, sambung ulang 1 detik berlipat sampai 10 detik), `hub.ts` (pelanggan, jendela 400 ms trailing per event, heartbeat `: ping` tiap 15 detik), `ticket.ts`, `handler.ts`. Hub dirakit di `index.ts` dan masuk ke `createApp({ realtime })`; tanpa `realtime` route stream tidak didaftarkan, jadi test lain tidak berubah.
- Counter dibaca lewat koneksi LISTEN itu sendiri, bukan pool. Lewat pool, bacaan antre di belakang 200 request k6 dan dashboard hanya bergerak di akhir burst. Test "still pushes while every pooled connection is busy" menjaganya.
- Route stream didaftarkan di `createApp` sebelum route events, supaya `/events/stream` tidak ditangkap `/events/:id`, dan sebelum `organizerEventRoutes` yang memasang `requireAuth` di `*`.
- Klien di-subscribe sebelum `await` pertama di callback `streamSSE`, jadi tidak ada perubahan yang lolos di antara header respons (`open` di browser) dan subscribe. Pesan pertama selalu `retry: 3000`.
- Pesan: publik event `quota` `{ eventId, ticketTypes: [{ id, remaining }] }`; organizer event `quota` (`id`, `quota`, `sold`, `reserved`, `remaining`) lalu event `orders` `{ eventId }`. Tidak ada keadaan awal; browser memuat ulang lewat REST setiap stream terbuka.
- Klien lambat: `openStream` menghitung byte yang ditulis tapi belum diambil (promise `stream.write` belum selesai; node-server berhenti membaca body selama socket penuh). Lewat `maxBufferedBytes` hub (default 64 KB) socket dihancurkan lewat `c.env.incoming.socket` lalu `stream.abort()`. Abort saja tidak membebaskan koneksi karena node-server menunggu `drain`. Pesan SSE ditulis sendiri (`event:`/`data:`), bukan `writeSSE`, supaya ukurannya diketahui.
- Web: request tiket yang menjawab 401, 403, atau 404 menghentikan `useLiveStream` (tanpa retry dan tanpa polling) dan mengisi `stoppedBy`; dashboard menampilkan alasannya lewat `messageFor`. `EventSource` tidak memberi status HTTP, jadi stream publik tetap mencoba ulang semua error.
- Koneksi LISTEN putus: semua stream ditutup dan stream baru 503 `DATABASE_UNAVAILABLE` sampai tersambung lagi, karena notifikasi selama putus hilang.
- Tiket stream: JWT HS256 `{ user_id, event_id, scope: "stream", iat, exp }`, 60 detik, ditandatangani `JWT_SECRET` yang sama. Tanpa klaim `role`, jadi `verifyToken` login menolaknya. Stream organizer: tanpa tiket 401 `UNAUTHORIZED`, tiket rusak/kedaluwarsa/event lain 401 `INVALID_TOKEN`, bukan pemilik 403, event tidak ada 404, id bukan uuid 400.
- Shutdown: `sweeper.stop()`, lalu `realtime.stop()` (tutup semua stream dan koneksi LISTEN), lalu `server.close` dan pool. API berhenti sekitar 1 detik walaupun ada stream terbuka.
- Nginx: location regex `^/api/(events/stream|organizer/events/[^/]+/stream)$` dengan `rewrite` (regex location tidak boleh `proxy_pass` ber-URI), `proxy_buffering off`, `proxy_read_timeout 1h`.
- Web: `hooks/useLiveStream.ts` membuka `EventSource`, menyambung ulang sendiri tiap 3 detik (organizer butuh tiket baru), memuat ulang query saat `open`, dan mengembalikan `polling = true` kalau putus lebih dari 10 detik; halaman lalu memasang `refetchInterval` 10 detik. `usePublicQuota` mem-patch cache `["events"]` dan `["event", id]`; `useOrganizerStream` mem-patch `["organizer-event", id]` dan meng-invalidate `["organizer-orders", id]` saat event `orders`.
- Dashboard memasang observer kedua pada query event hanya untuk `refetchInterval`, karena query pertama ada di komponen halaman sebelum status stream diketahui. Teks status di bawah judul jujur: "diperbarui langsung" atau "sambungan langsung terputus, diperbarui tiap 10 detik".
- Detail event menutup pemesanan saat `startsAt` terlewati menurut `serverNow()` lewat `useHasPassed` (satu `setTimeout`, dipotong per jam karena `setTimeout` meluap di atas sekitar 24,8 hari).
- Query Drizzle bersifat lazy: `db.execute(sql...)` yang tidak di-`await` tidak pernah jalan. Di test yang perlu query berjalan bersamaan, pakai `pool.query`.

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
- Compose punya `JWT_SECRET` dan `PAYMENT_WEBHOOK_SECRET` default khusus dev supaya `docker compose up` jalan di clone bersih. Jangan dipakai di luar lokal: `loadConfig` menolak awalan `dev-only-` dan `ganti-dengan-` untuk `JWT_SECRET` dan `PAYMENT_WEBHOOK_SECRET` kalau `NODE_ENV=production`.
- Image API multi-stage dan berjalan sebagai user non-root `node`.
- CI: job `test` (typecheck + Testcontainers) dan job `web` (typecheck + build) di setiap push dan PR; `build-and-push` ke `ghcr.io/fabverse0/quotient-ticketing` hanya dari push ke `main`, tag `sha-<short>` dan `latest`.

## Nilai tambah yang direncanakan

1. Strategi kuota `QUOTA_STRATEGY=naive|atomic` untuk membuktikan versi naif bisa oversell.
2. Header `Idempotency-Key` di endpoint buat pesanan.
3. Invariant checker (skrip dan endpoint admin).
4. Simulator penyedia pembayaran dengan mode kacau (webhook ganda, terlambat, tidak berurutan). Belum dibuat; kasus itu diuji lewat test di `payments-webhook.test.ts`.
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
├── web/                     (termasuk nginx.conf)
├── tools/
│   ├── demo.mjs             (naive vs atomic dalam satu perintah)
│   ├── demo-data/
│   ├── load-test/
│   └── invariant-check/
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
7. Nginx (sudah di container web), 2 replika, simulator kacau, deploy (tiga terakhir belum dikerjakan)
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

### Frontend: siapa memutuskan dan peran tiap skill

Yang memutuskan desain adalah Fab. DESIGN.md adalah catatan keputusannya saat ini dan menjadi titik awal setiap halaman, bukan aturan yang tidak boleh diubah.

Kalau sebuah skill menyarankan sesuatu yang berbeda dari DESIGN.md:
1. Jangan memutuskan sendiri dan jangan diam diam mengikuti salah satunya.
2. Sampaikan usulannya dalam format: "Saran: ... Alasan: ... Bedanya dengan DESIGN.md: ... Dampak kalau diterapkan: ...".
3. Tunggu keputusan Fab. Kalau disetujui, terapkan dan perbarui DESIGN.md di commit yang sama.
4. Saran yang menyangkut aturan wajib antislop (kontras, keyboard, fokus, state kosong, loading, error, tombol yang tidak berfungsi, klaim palsu) bukan soal selera. Terapkan, lalu beri tahu Fab.

Pembagian peran supaya skill tidak saling bertabrakan:

| Skill | Perannya | Bukan perannya |
|---|---|---|
| DESIGN.md | Arah: palet, tipografi, komponen, tata letak, animasi | |
| frontend-design | Eksekusi: menerjemahkan DESIGN.md jadi kode yang rapi, mengusulkan perbaikan visual | Mengganti arah desain tanpa persetujuan |
| antislop-ui, antislop-human | Penyaring dan aksesibilitas, Delivery Gate sebelum halaman dianggap selesai | Menentukan gaya baru |
| antislop-code | Membersihkan komentar khas AI | Mengubah perilaku kode |
| Context7 | Dokumentasi React, Vite, TanStack Query, Tailwind versi terbaru | |
| playwright | Membuka halaman, klik setiap alur, screenshot sebagai bukti | Menulis desain |
| chrome-devtools-mcp | Mengukur performa, network, console | Mengubah desain demi angka tanpa persetujuan |

Urutan kerja per halaman: baca DESIGN.md, bangun dengan frontend-design, saring dengan antislop, verifikasi dengan playwright, ukur dengan chrome-devtools-mcp kalau halaman itu berat. Semua saran yang muncul di langkah mana pun mengikuti format di atas.
