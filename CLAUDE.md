# Quotient (quotient-ticketing)

Final Project Back-End Intermediate (Veterantech). API penjualan tiket event dengan kuota terbatas.
Deadline: Sabtu 21 November 2026, 23:59 WIB. Demo: Minggu 22 November 2026, 13:00 WIB.

Nama "Quotient" berarti hasil bagi: kuota yang terbatas dibagi tepat ke banyak pembeli, tidak lebih satu pun.

## Cara bekerja di repo ini

- Pemilik proyek (Fab) yang memegang keputusan desain. Kalau ada keputusan yang belum tertulis di sini atau di DECISIONS.md, tanyakan dulu, jangan menebak.
- Setiap selesai satu modul, jelaskan konsep dan alur transaksinya dengan bahasa sederhana. Fab harus bisa menjelaskan ulang saat tanya jawab.
- DECISIONS.md ditulis oleh Fab. Boleh bantu merapikan, tapi jangan mengarang alasan.
- Bahasa dokumentasi: Indonesia yang natural. Kode, nama variabel, dan pesan commit dalam bahasa Inggris.

## Stack

| Lapisan | Pilihan |
|---|---|
| Runtime | Node.js + TypeScript |
| HTTP | Hono |
| Validasi | Zod |
| Database | PostgreSQL (satu satunya sumber kebenaran) |
| Query | Drizzle. Query inti kuota ditulis sebagai raw SQL |
| Migrasi | drizzle-kit |
| Job kedaluwarsa | pg-boss / sweeper berkala |
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
