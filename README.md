# Quotient

API penjualan tiket event dengan kuota terbatas. Nama "Quotient" berarti hasil bagi: kuota yang terbatas dibagi tepat ke banyak pembeli, tidak lebih satu pun.

Stack: Node.js, TypeScript, Hono, Drizzle, PostgreSQL. Alasan setiap keputusan desain ada di [DECISIONS.md](DECISIONS.md).

## Menjalankan

```bash
docker compose up --build
```

Buka aplikasi di **http://localhost:8080**. Frontend disajikan oleh nginx di container web, yang juga meneruskan `/api` ke API, jadi browser hanya berbicara dengan satu origin. API tetap bisa dipanggil langsung di `http://localhost:3000`, dan Postgres ada di port host 5433. Migrasi dijalankan otomatis saat API start.

Untuk development frontend dengan hot reload, jalankan `npm --prefix web run dev` (Vite di port 5173, `/api` diteruskan ke `localhost:3000`).

## Bukti: 200 pembeli, kuota 100

Uji ini menjawab pertanyaan utama proyek: apakah kuota bisa terjual lebih kalau banyak orang memesan di detik yang sama?

```bash
node tools/demo.mjs
```

Satu perintah ini menjalankan urutan lengkap dua kali, sekali dengan strategi `naive` lalu dengan `atomic`. Setiap fase memakai database yang baru di-reset, di compose project terpisah (`quotient-demo`, port 3100 dan 5434), jadi stack dev tidak tersentuh. Urutannya:

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

Ringkasan tiap run tersimpan di `tools/load-test/results/` (di-gitignore). Langkah-langkahnya bisa dijalankan satu per satu, lihat [tools/load-test/README.md](tools/load-test/README.md).

### Invariant checker

```bash
DATABASE_URL=postgres://quotient:quotient@localhost:5433/quotient npm --prefix api run invariants
```

Memeriksa enam hal: `reserved` dan `sold` sesuai dengan pesanan PENDING dan PAID, jumlah tiket sama dengan `sold`, counter dan pesanan aktif tidak melebihi kuota, dan tidak ada pembeli dengan lebih dari 4 tiket aktif per event. Exit code 0 kalau semua OK dan 1 kalau ada yang LANGGAR. Organizer bisa melihat laporan yang sama di `GET /admin/invariants`.
