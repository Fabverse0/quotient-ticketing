# Riset Desain Quotient

Catatan riset sebelum implementasi, 18 November 2026. Isinya opsi yang dipertimbangkan beserta trade-off, sebagai bahan DECISIONS.md.

## 1. Menjaga kuota agar tidak oversell

**Atomic conditional update.** Satu statement melakukan cek dan potong sekaligus:

```sql
UPDATE ticket_types
SET reserved = reserved + $qty
WHERE id = $id AND sold + reserved + $qty <= quota
RETURNING *;
```

Kalau hasilnya 0 baris, kuota habis. Tidak ada jeda antara baca dan tulis. Catatan: atomic update hanya menyelesaikan pemotongan kuota. Pembuatan pesanan harus ada di transaksi yang sama.

**SELECT ... FOR UPDATE.** Kunci baris, cek, lalu ubah. Lebih fleksibel kalau aturannya banyak, tapi request lain harus antre menunggu lock.

**Serializable + retry.** Benar secara teori, tapi butuh logika retry. Berlebihan untuk event kecil.

**Redis sebagai penghitung kuota.** Cepat, tapi menciptakan dua sumber kebenaran. Tidak dipakai.

Pilihan: atomic update di dalam transaksi, ditambah `CHECK (sold + reserved <= quota)` sebagai pengaman terakhir di level database.

## 2. Batas 4 tiket per pembeli

Ini juga race condition. Pembeli dengan 2 tiket aktif yang mengirim dua request "pesan 2" bersamaan bisa lolos cek dua duanya dan berakhir dengan 6 tiket.

Solusi: `pg_advisory_xact_lock(hash(buyer_id, event_id))` di awal transaksi, lalu hitung tiket aktif. Lock lepas otomatis saat transaksi selesai.

Batasan yang diakui: batas berlaku per akun. Multi-akun di luar ruang lingkup karena butuh verifikasi identitas.

## 3. Kedaluwarsa 15 menit

| Opsi | Kelebihan | Kekurangan |
|---|---|---|
| Lazy (cek saat dibaca) | Tanpa infrastruktur tambahan | Kuota berbasis counter tidak kembali sampai datanya disentuh |
| Sweeper berkala | Sederhana, cukup Postgres | Ada jeda sampai interval berikutnya |
| Delayed job (BullMQ/Redis) | Presisi | Butuh Redis, sumber kebenaran tambahan |

Pilihan: sweeper berkala (30 detik) ditambah guard di endpoint bayar yang menolak pesanan lewat `expires_at`. Kebenaran tidak bergantung pada timing worker. Kalau API lebih dari satu instance, sweeper memakai `FOR UPDATE SKIP LOCKED`.

## 4. State machine pesanan

`PENDING` ke `PAID`, `CANCELLED`, atau `EXPIRED`. Tambahan `REFUND_REQUIRED` untuk webhook yang datang setelah kedaluwarsa.

Setiap transisi: `UPDATE orders SET status = ... WHERE id = $1 AND status = 'PENDING' RETURNING`. Kalau bayar, batal, dan expire terjadi bersamaan, hanya satu yang mendapat baris. Pemenang itulah yang menerbitkan tiket atau mengembalikan kuota. Ditambah `UNIQUE` di tabel tiket.

## 5. Pembayaran dan webhook

- Endpoint simulasi bayar, hanya aktif di mode development.
- Webhook dengan signature HMAC dan `event_id`.
- Tabel `processed_events`, `INSERT ... ON CONFLICT DO NOTHING`. Duplikat tetap dibalas 2xx supaya penyedia tidak mengirim ulang.
- Logika bisnis juga idempoten: set status, bukan menambah counter.
- Webhook setelah kedaluwarsa: ditolak dan ditandai `REFUND_REQUIRED`.

## 6. Idempotency-Key untuk pembuatan pesanan

Double klik atau retry dari frontend bisa membuat pesanan ganda dan menahan kuota dua kali. Header `Idempotency-Key` membuat request kedua mengembalikan pesanan yang sama.

## 7. Real time

SSE dipilih karena datanya satu arah. Untuk 2 replika, pakai `LISTEN/NOTIFY` Postgres:
- `pg_notify` dipanggil di dalam transaksi, dan baru terkirim setelah commit. Rollback tidak memicu notifikasi.
- Payload maksimal sekitar 8 KB, jadi cukup kirim `event_id`.
- Notifikasi digabung (throttle 300 sampai 500 ms) supaya 200 pesanan tidak menjadi 200 push.
- LISTEN butuh koneksi khusus, bukan dari pool biasa.
- Nginx perlu `proxy_buffering off` untuk route SSE.

Angka di layar hanya informasi. Keputusan akhir tetap di transaksi database.

## 8. Database lain yang dipertimbangkan

| Database | Catatan |
|---|---|
| MySQL/MariaDB | Bisa, tapi `GET_LOCK` terikat koneksi, bukan transaksi |
| MongoDB | Atomic per dokumen, transaksi multi dokumen butuh replica set |
| CockroachDB | Serializable default, wajib retry |
| SQLite | Satu penulis, tidak cocok untuk 2 replika |
| Supabase | Postgres juga, tapi versi cloud melanggar syarat satu perintah. Pooler mode transaksi mengganggu LISTEN dan prepared statement. Hanya untuk deploy |

## 9. Nginx

Opsional. Berguna kalau ada frontend dan 2 replika: satu origin (tanpa CORS), load balancing, rate limit per IP. Biaya: satu komponen lagi, konfigurasi SSE khusus. Bukti kebenaran kuota datang dari 2 replika, bukan dari Nginx.

## 10. Stack

Hono + TypeScript dipilih dibanding Go. Go unggul di ukuran image, RAM, dan SQL eksplisit lewat sqlc, tapi rubrik tidak menilai efisiensi resource dan skala kasus kecil. TypeScript memberi waktu lebih untuk fitur pembuktian dan dokumentasi. Ukuran image Node dikecilkan dengan multi-stage build dan dependency produksi saja.

## 11. CI/CD

GitHub Actions: job test dengan Postgres sebagai service container, lalu build dan push ke GHCR. Tag dibuat dengan `docker/metadata-action` memakai `type=sha`. Login GHCR memakai `GITHUB_TOKEN` dengan permission `packages: write`.

## Referensi

- https://dev.to/sampurnakart/preventing-overselling-in-inventory-systems-with-postgresql-transactions-and-idempotency-1ccj
- https://milanjovanovic.tech/blog/pessimistic-locking-ef-core-postgresql
- https://webhooks.fyi/ops-experience/idempotency
- https://prismatic.io/blog/how-do-i-make-webhook-processing-idempotent/
- https://docs.docker.com/build/ci/github-actions/manage-tags-labels/
- https://docs.github.com/actions/guides/publishing-docker-images
- https://bullmq.io/
