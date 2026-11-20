# DECISIONS

Catatan keputusan desain Quotient. Setiap keputusan ditulis dengan format yang sama: konteks, opsi yang saya pertimbangkan, pilihan, trade-off, dan kapan pilihan ini jadi salah. Bahan riset lengkapnya ada di `docs/RESEARCH.md`.

Pertanyaan yang ingin saya jawab di seluruh dokumen ini: **kenapa kuota Quotient tidak mungkin terjual lebih, bahkan dengan ratusan request bersamaan?**

---

## 1. Cara menjaga kuota tidak terjual lebih

**Konteks.** Banyak orang memesan di detik yang sama. Pola paling umum, "baca sisa kuota, cek di kode, lalu tulis", punya celah di antara baca dan tulis. Dua request bisa membaca angka yang sama dan sama sama merasa masih ada kursi.

**Opsi.**
- `SELECT ... FOR UPDATE`: kunci baris, cek, lalu ubah. Benar, tapi request lain harus antre memegang lock lebih lama.
- Isolasi SERIALIZABLE dengan retry: benar secara teori, tapi saya harus menulis logika retry untuk setiap transaksi.
- Counter di Redis: cepat, tapi kuota jadi tercatat di dua tempat.
- **Atomic conditional update** di PostgreSQL.

**Pilihan.** Satu statement yang mengecek dan memotong sekaligus:

```sql
UPDATE ticket_types
SET reserved = reserved + $qty
WHERE id = $id AND sold + reserved + $qty <= quota
RETURNING *;
```

Kalau hasilnya nol baris, kuota habis. Statement ini berjalan di transaksi yang sama dengan pembuatan pesanan, jadi kalau pembuatan pesanan gagal, potongan kuota ikut batal.

Di atasnya ada jaring pengaman terakhir: `CHECK (sold + reserved <= quota)` di tabel. Kalau suatu hari ada kode yang salah, database tetap menolak.

**Kenapa CHECK saja tidak cukup.** Saya membuat strategi `naive` (baca ke aplikasi, lalu tulis nilai absolut) untuk membuktikannya. Dua transaksi membaca `reserved = 99`, lalu dua duanya menulis `reserved = 100`. Angka 100 tidak melanggar CHECK, padahal ada dua pesanan. Ini *lost update*: counter terlihat normal, tapi tiket terjual lebih. CHECK hanya menolak angka yang terlalu besar, sedangkan lost update menghasilkan angka yang terlalu kecil. Yang menangkapnya adalah invariant checker (lihat bagian 14).

Kalau CHECK sampai terpicu di jalur atomic, itu tanda bug. Klien tetap menerima 409 `QUOTA_EXHAUSTED`, tapi server mencatatnya sebagai error "capacity guard triggered", supaya bug tidak tersembunyi.

**Trade-off.** Baris `ticket_types` jadi *hot row* yang diperebutkan semua pembeli. Karena itu pemotongan kuota saya taruh di langkah terakhir sebelum commit, supaya lock baris itu dipegang sesingkat mungkin.

**Kapan jadi salah.** Kalau skalanya naik ke ribuan transaksi per detik untuk satu event, satu baris yang diperebutkan bisa jadi bottleneck. Saat itu kuota perlu dipecah (misalnya per bucket) atau ada antrean di depan database.

---

## 2. Batas 4 tiket per pembeli

**Konteks.** Batas dihitung dari semua pesanan PENDING dan PAID milik satu pembeli di satu event. Ini juga race condition: pembeli dengan 2 tiket aktif yang mengirim dua request "pesan 2" bersamaan bisa lolos dua duanya dan memegang 6 tiket. CHECK tidak bisa menjaga aturan ini karena melibatkan banyak baris, termasuk baris yang belum ada.

**Pilihan.** Advisory lock per pasangan (pembeli, event) di awal transaksi:

```sql
SELECT pg_advisory_xact_lock(hashtextextended(buyer_id::text || ':' || event_id::text, 0));
```

Setelah lock didapat, baru jumlah tiket aktif dihitung. Lock lepas otomatis saat transaksi selesai.

**Detail yang menentukan: level isolasi harus READ COMMITTED.** Di level ini setiap statement mengambil snapshot baru, sehingga hitungan yang dijalankan setelah lock pasti melihat pesanan yang baru di-commit pemegang lock sebelumnya. Di REPEATABLE READ snapshot sudah diambil sebelum lock, dan batas 4 tiket tetap jebol walaupun lock-nya ada.

**Urutan lock** di seluruh sistem selalu sama: lock idempotency, lalu lock pembeli dan event, lalu baris `orders`, baru baris `ticket_types`. Urutan yang konsisten mencegah deadlock.

**Bukti.** Saat lock saya matikan sementara, 6 dari 10 request paralel lolos dan satu pembeli memegang 12 tiket. Dengan lock, tepat 2 yang lolos.

**Trade-off.** Request dari pembeli yang sama untuk event yang sama harus antre. Pembeli berbeda tidak saling menunggu.

**Batasan.** Batas ini berlaku per akun. Satu orang dengan banyak akun bisa melewatinya. Mencegahnya butuh verifikasi identitas, dan itu di luar ruang lingkup tugas.

---

## 3. Kedaluwarsa pesanan 15 menit

**Opsi.**

| Opsi | Kelebihan | Kekurangan |
|---|---|---|
| Lazy (cek saat disentuh) | Tanpa komponen tambahan | Kuota tidak kembali sampai ada yang menyentuh pesanan |
| Sweeper berkala | Sederhana, cukup PostgreSQL | Ada jeda sampai putaran berikutnya |
| Delayed job (BullMQ, pg-boss) | Presisi | Komponen tambahan, dan untuk BullMQ butuh Redis |

**Pilihan.** Sweeper berkala tiap 30 detik, **ditambah** penolakan di jalur bayar. Pembayaran untuk pesanan yang sudah lewat `expires_at` ditolak, walaupun sweeper belum jalan. Jadi kebenaran sistem tidak bergantung pada kapan sweeper berjalan.

Batas waktunya konsisten: bayar dan cancel memakai `expires_at > now`, sweeper memakai `expires_at <= now`. Tepat di menit ke-15, pesanan pasti tidak bisa dibayar dan pasti disapu.

**Kenapa tidak pg-boss.** Fungsi `schedule()` pg-boss paling sering mengirim satu job per menit, jadi interval 30 detik tidak bisa dipenuhi tanpa akal akalan. Jaminan utamanya (job tidak dikerjakan dua kali) sudah saya dapat dari `FOR UPDATE SKIP LOCKED`. Jadi saya pakai `setTimeout` berantai sekitar 30 baris, yang menjadwalkan ulang dirinya setelah putaran selesai supaya putaran tidak tumpang tindih.

**Cara kerja sweeper.** Satu batch (maksimal 100 pesanan) dalam satu transaksi:
1. Kunci pesanan jatuh tempo dengan `FOR UPDATE SKIP LOCKED`. Pesanan yang sedang dipakai transaksi lain dilewati, bukan ditunggu.
2. Ubah ke EXPIRED dengan guard `status = 'PENDING'`.
3. Kembalikan `reserved` per tipe tiket, diurutkan berdasarkan `id` supaya dua sweeper tidak deadlock.

`SKIP LOCKED` menjaga **kelancaran**, status guard menjaga **kebenaran**. Tanpa `SKIP LOCKED`, angka kuota tetap benar, tapi sweeper bisa tertahan.

**Cara mengujinya tanpa menunggu 15 menit.** Waktu diambil lewat abstraksi `clock` yang disuntikkan ke aplikasi (`createApp({ db, clock })`). Test memakai jam palsu yang bisa dimajukan.

**Kapan jadi salah.** Kalau kuota harus kembali tepat di detik ke-900 (misalnya untuk flash sale yang sangat ketat), jeda 30 detik terlalu lama, dan perlu delayed job per pesanan.

---

## 4. State machine pesanan dan tiket yang tidak terbit dua kali

**Status.** `PENDING` menuju `PAID`, `CANCELLED`, atau `EXPIRED`. Ada satu status tambahan, `REFUND_REQUIRED`, untuk pembayaran yang datang terlambat (bagian 5).

**Prinsip.** Setiap transisi ditulis sebagai:

```sql
UPDATE orders SET status = ... WHERE id = $1 AND status = 'PENDING' RETURNING ...
```

Bayar, batal, kedaluwarsa, dan webhook terlambat bisa berebut pesanan yang sama. Hanya satu yang mendapat baris kembali, dan hanya pemenang itu yang menyentuh kuota atau menerbitkan tiket. Saat dua transaksi berebut, yang kedua menunggu lock baris, lalu PostgreSQL mengevaluasi ulang kondisi `status = 'PENDING'` pada versi baris terbaru dan transaksi kedua mendapat nol baris. Pemenangnya ditentukan database, bukan kode saya.

Perpindahan kuota per transisi:

| Transisi | reserved | sold |
|---|---|---|
| Pesan (PENDING) | +q | |
| PENDING ke PAID | -q | +q |
| PENDING ke CANCELLED / EXPIRED | -q | |

**Tiket tidak terbit dua kali.** Dua lapis: status guard di atas, dan `UNIQUE (order_id, seq)` di tabel tiket. Kode tiket diambil dari `crypto.randomBytes` (96 bit), jadi tidak berurutan dan tidak bisa ditebak.

Setiap status juga punya kolom waktu dengan CHECK, misalnya `status <> 'PAID' OR paid_at IS NOT NULL`, supaya tidak ada status tanpa jejak waktu.

**Bukti.** Saat guard `status = 'PENDING'` di cancel saya hapus, cancel kedua mengurangi `reserved` lagi sampai negatif. Test menangkapnya.

---

## 5. Simulasi pembayaran dan webhook idempoten

**Dua jalur, satu service.** Simulasi bayar (`POST /orders/:id/pay`) dan webhook penyedia (`POST /webhooks/payment`) sama sama memanggil `markOrderPaid`, jadi aturannya tidak bisa berbeda.

**Simulasi bayar** hanya didaftarkan kalau `NODE_ENV` bukan production. Di sistem nyata, pembeli tidak boleh menandai pesanannya sendiri lunas. Docker Compose sengaja memakai `development` supaya simulasi bisa dipakai untuk demo. Bayar dua kali mengembalikan 200 dengan tiket yang sama, karena kasus realistisnya adalah retry setelah respons hilang.

**Webhook** dijaga tiga lapis:
1. **Signature.** HMAC-SHA256 dihitung dari byte body asli (bukan JSON yang di-parse ulang), dibandingkan dengan `timingSafeEqual`.
2. **Dedupe.** Langkah pertama transaksi adalah `INSERT INTO processed_events ... ON CONFLICT (event_id) DO NOTHING`. Kalau `event_id` sudah pernah tercatat, langsung balas 200 tanpa efek.
3. **Status guard** di `markOrderPaid`.

Pencatatan dedupe dan perubahan pesanan ada di satu transaksi. Kalau ada error di tengah, semuanya rollback, dan kiriman ulang dari penyedia tetap diproses dengan benar.

**Event yang sudah tercatat selalu dibalas 2xx**, termasuk amount yang tidak cocok (dicatat, pesanan tetap PENDING), `order_id` tidak dikenal, dan tipe event yang tidak dikenal (outcome `IGNORED`). Membalas 4xx membuat penyedia mengirim ulang tanpa henti.

**Webhook yang datang terlambat.**
- Pesanan sudah EXPIRED atau CANCELLED: diubah ke `REFUND_REQUIRED`, kuota tidak disentuh, tiket tidak terbit.
- Pesanan masih PENDING tapi sudah lewat `expires_at` (sweeper belum sempat jalan): diubah ke `REFUND_REQUIRED` **dan** `reserved` dikembalikan di transaksi itu. Kalau tidak, kuotanya bocor, karena sweeper hanya memproses PENDING. Transisi ini juga memakai guard `status = 'PENDING'`, jadi kalau sweeper berjalan bersamaan, kuota hanya kembali sekali.

**Bukti.** Lima mutasi di modul ini (status guard, batas `expires_at`, `ON CONFLICT`, hasil dedupe, guard REFUND_REQUIRED) semuanya tertangkap test.

---

## 6. Idempotency-Key untuk pembuatan pesanan

**Konteks.** Pembeli bisa menekan tombol dua kali, atau frontend mengulang request saat koneksi putus. Tanpa pengaman, terbentuk dua pesanan dan kuota tertahan ganda.

**Pilihan.** Header `Idempotency-Key`, disimpan di tabel `idempotency_keys` dengan primary key `(buyer_id, key)` dan hash dari body.
- Key dan body sama: kembalikan pesanan yang sama (200), kuota tidak disentuh.
- Key sama, body berbeda: 422 `IDEMPOTENCY_KEY_REUSED`.

Pengecekan ini dilakukan paling awal, dengan advisory lock untuk key tersebut, supaya dua request kembar yang datang bersamaan mengantre. Primary key tetap ada sebagai jaring pengaman.

**Trade-off.** Request yang gagal (misalnya kuota habis) tidak menyimpan key-nya, karena transaksinya di-rollback. Retry dengan key yang sama akan diproses ulang. Beberapa penyedia pembayaran menyimpan respons error juga; saya memilih yang lebih sederhana.

**Bukti.** Tanpa lock idempotency, dua request kembar berakhir 500 karena ditolak primary key. Dengan lock, keduanya mendapat 200 yang bersih. Polanya sama dengan CHECK kuota: database menjaga kebenaran, kode menjaga pengalaman pengguna.

---

## 7. Satu pesanan satu tipe tiket

**Pilihan.** Satu pesanan hanya untuk Reguler atau VIP, tidak campur. Pembeli yang ingin keduanya membuat dua pesanan.

**Alasan.** Skemanya cukup kolom `ticket_type_id` di `orders`, tanpa tabel `order_items`. Transaksi pesanan hanya mengunci satu baris `ticket_types`, jadi tidak ada risiko deadlock antar tipe tiket.

**Trade-off.** Pembeli yang ingin dua tipe harus checkout dua kali, dan masing masing punya batas waktu 15 menit sendiri.

---

## 8. PostgreSQL sebagai satu satunya sumber kebenaran (tanpa Redis)

**Pilihan.** Semua aturan penting dijaga di PostgreSQL: atomic update, CHECK, UNIQUE, FK komposit, advisory lock, dan `SKIP LOCKED`.

**Kenapa tidak Redis.** Kuota di Redis berarti dua sumber kebenaran, dan saya harus bisa menjawab "kalau keduanya beda, mana yang benar?" serta mengembalikan kuota di dua tempat saat kedaluwarsa. Untuk event kecil, PostgreSQL sudah cukup cepat dan jauh lebih mudah dibuktikan kebenarannya.

**Kenapa tidak Supabase sebagai database utama.** Supabase cloud melanggar syarat "satu perintah dari mesin bersih", dan pooler mode transaksinya mengganggu fitur yang terikat sesi. Supabase hanya relevan sebagai tempat deploy Postgres.

**Kapan jadi salah.** Kalau trafik naik jauh, Redis bisa ditambahkan sebagai penyaring awal yang cepat, dengan PostgreSQL tetap sebagai hakim terakhir.

---

## 9. Real time dengan SSE dan LISTEN/NOTIFY

**Konteks.** Pembeli melihat sisa kursi dan organizer melihat counter bergerak selagi pesanan masuk. Datanya satu arah (server ke browser), jadi saya memilih SSE: lebih sederhana dari WebSocket. Untuk lebih dari satu instance API, perubahan kuota disebarkan lewat `LISTEN/NOTIFY` PostgreSQL. `pg_notify` dipanggil di dalam transaksi dan baru terkirim setelah commit, jadi rollback tidak pernah memicu notifikasi. Ini juga alasan tidak perlu Redis pub/sub.

Angka di layar hanya informasi. Keputusan akhir tetap di transaksi database, dan frontend tetap harus menangani "tiket baru saja habis".

### 9a. Autentikasi SSE organizer: tiket stream berumur pendek

**Pilihan.** `EventSource` tidak bisa mengirim header `Authorization`. Frontend meminta `POST /organizer/events/:id/stream-ticket` dengan Bearer biasa, lalu mendapat JWT berklaim `scope: "stream"` dan `event_id` yang berlaku 60 detik. Tiket dipakai di `EventSource('/api/organizer/events/:id/stream?ticket=...')`, hanya diperiksa saat koneksi dibuka, dan setiap sambung ulang meminta tiket baru.

**Alasan.** JWT login tidak pernah masuk ke URL, jadi tidak tercatat di log akses nginx. Alternatif yang ditolak: JWT login di query string (token berumur panjang bocor ke log), cookie HttpOnly (mengubah seluruh alur auth), dan SSE lewat `fetch` dengan header (sambung ulang harus dibuat sendiri).

**Detail.** Tiket tidak punya klaim `role`, jadi tidak bisa dipakai sebagai token login, dan token login tidak punya `scope`, jadi tidak bisa dipakai sebagai tiket. Saat stream dibuka, kepemilikan event diperiksa lagi ke database. Tanpa tiket, tiket rusak, kedaluwarsa, atau untuk event lain: 401. Tiket milik organizer yang bukan pemilik: 403.

**Trade-off.** Tiket tetap tercatat di log akses, tapi hanya berlaku 60 detik dan hanya untuk satu event. Karena setiap sambung ulang butuh URL baru, sambung ulang di frontend tetap dibuat sendiri, bukan diserahkan ke `EventSource`. Yang tetap didapat dari `EventSource` adalah parsing stream dan event bernama.

**Error yang tidak dicoba ulang.** Kalau request tiket menjawab 401, 403, atau 404, frontend berhenti: tidak menyambung ulang dan tidak polling, karena mencoba lagi tidak akan mengubah jawabannya. Dashboard menulis "pembaruan langsung berhenti" dan menampilkan alasannya, misalnya "Angka di halaman ini tidak diperbarui lagi. Event ini tidak ditemukan." Untuk 401, sesi berakhir seperti di halaman lain. Error lain (jaringan, 503) tetap dicoba ulang tiap 3 detik. `EventSource` tidak pernah memberi tahu status HTTP, jadi error permanen hanya bisa dikenali dari request tiket. Karena request itu menjalankan pemeriksaan yang sama tepat sebelum stream dibuka, kasus yang ditangkap sama. Stream publik tidak punya request tiket, jadi semua error-nya tetap dicoba ulang.

### 9b. Bentuk stream

**Pilihan.**
- Publik, `GET /events/stream`: event `quota` berisi `{ eventId, ticketTypes: [{ id, remaining }] }` setiap kuota sebuah event berubah. Dipakai halaman daftar dan detail event.
- Organizer, `GET /organizer/events/:id/stream`: event `quota` berisi `quota`, `sold`, `reserved`, dan `remaining` per tipe, lalu event `orders` sebagai sinyal bahwa daftar pesanan terbaru berubah.

**Alasan.** Publik hanya melihat `remaining`, sama dengan endpoint REST publik. Rincian `sold` dan `reserved` tetap hanya untuk pemilik event.

**Trade-off.** Stream tidak mengirim keadaan awal. Setiap kali stream terbuka, browser memuat ulang data lewat REST, supaya perubahan selama terputus tidak terlewat.

### 9c. Sumber notifikasi: trigger database

**Pilihan.** Migrasi `0003_quota_changed_notify` memasang trigger `AFTER UPDATE OF sold, reserved ON ticket_types` yang memanggil `pg_notify('quota_changed', event_id)`.

**Alasan.** Trigger berjalan di transaksi yang sama untuk semua jalur (pesan atomic dan naive, batal, bayar, sweeper, webhook refund), jadi tidak ada jalur yang bisa terlewat, dan notifikasi hanya terkirim setelah commit. Postgres menggabungkan notifikasi identik dalam satu transaksi, jadi satu batch sweeper hanya menghasilkan satu notifikasi per event. Alternatifnya, `pg_notify` eksplisit di setiap jalur kode, berisiko ada jalur yang lupa dipasangi.

**Trade-off.** Payload hanya `event_id`, jadi penerima membaca counter sendiri. Perubahan status yang tidak menggeser counter tidak memicu apa pun: pesanan EXPIRED atau CANCELLED yang menjadi REFUND_REQUIRED karena webhook terlambat tidak mengirim sinyal `orders`.

### 9d. Penerima dan penggabungan

**Pilihan.** Satu koneksi LISTEN khusus per instance di luar pool, dengan sambung ulang kalau koneksinya putus (jeda 1 detik, berlipat sampai 10 detik). Notifikasi digabung per event dengan jendela 400 ms (trailing): notifikasi pertama membuka jendela, berikutnya ikut, dan saat jendela habis counter dibaca sekali lalu dikirim ke semua pelanggan event itu. Heartbeat tiap 15 detik dan `retry: 3000`.

**Alasan.** LISTEN butuh koneksi khusus, bukan dari pool biasa. Tanpa penggabungan, 200 pesanan menjadi 200 push ke setiap browser.

**Temuan saat verifikasi.** Awalnya counter dibaca lewat pool. Saat k6 mengirim 200 pesanan, kesepuluh koneksi pool terpakai request pesanan, sehingga bacaan counter ikut antre sampai burst hampir selesai: dashboard hanya bergerak 0, 83, lalu 100. Bacaan counter dipindah ke koneksi LISTEN itu sendiri, dan run berikutnya bergerak 16, 35, 65, 100 dalam sekitar satu detik.

**Saat koneksi LISTEN putus.** Semua stream yang terbuka ditutup, dan stream baru ditolak 503 sampai koneksi tersambung lagi. Notifikasi selama putus hilang, jadi stream yang dibiarkan terbuka akan menampilkan angka lama tanpa tanda apa pun. Setelah ditutup, browser menyambung ulang dan memuat ulang datanya, atau beralih ke polling kalau putusnya lebih dari 10 detik.

**Klien yang terlalu lambat.** Server tidak menunggu klien yang berhenti membaca. Setiap stream menghitung byte yang sudah ditulis tapi belum diambil. Kalau jumlahnya melewati 64 KB (sekitar 400 pesan kuota), socket-nya diputus dan klien dilepas dari hub. Browser yang masih hidup akan menyambung ulang dan memuat ulang datanya. Hitungan ini bisa dipercaya karena node-server berhenti membaca body selama socket penuh. Menutup stream saja tidak cukup, karena server masih menunggu socket kosong lagi, jadi socket-nya harus dihancurkan. Diuji dengan socket mentah yang tidak pernah membaca: tanpa `socket.destroy()` koneksi tetap dipegang server, dengan `socket.destroy()` koneksi dilepas. Batas itu baru mulai terhitung setelah buffer socket di OS dan Node penuh, jadi klien yang macet sempat menerima lebih dari 64 KB sebelum diputus.

**Trade-off.** Setiap instance membaca counter sendiri, jadi dengan dua replika satu perubahan berarti dua bacaan. Kalau bacaan counter gagal, kiriman untuk jendela itu hilang sampai perubahan berikutnya.

---

## 10. Stack: Hono + TypeScript

**Opsi.** Go (pgx, sqlc) atau TypeScript (Hono, Drizzle).

**Pilihan.** Hono + TypeScript, dengan Drizzle, Zod, Vitest, dan Testcontainers.

**Alasan.** Go unggul di ukuran image, pemakaian RAM, dan SQL yang eksplisit lewat sqlc. Tapi rubrik tidak menilai efisiensi resource, skalanya kecil, dan kebenaran kuota tidak bergantung pada bahasa. TypeScript membuat waktu saya lebih banyak dipakai untuk alat pembuktian dan dokumentasi. Saya tetap belajar banyak hal baru: Hono, Drizzle, Testcontainers, dan k6. Go saya simpan untuk proyek berikutnya.

Query inti kuota tetap ditulis sebagai raw SQL, supaya ORM tidak menyembunyikan apa yang terjadi di database.

**Detail lain.**
- `bcryptjs` dipilih alih alih `bcrypt` native, supaya image Alpine dan CI tidak butuh toolchain build.
- Migrasi dijalankan lewat migrator `drizzle-orm` saat start, karena `drizzle-kit` tidak ada di image produksi.
- Image dibangun multi-stage dan berjalan sebagai user non-root.

---

## 11. Auth dengan JWT dan dua peran

**Konteks.** Auth tidak dinilai, tapi identitas pembeli menentukan batas 4 tiket.

**Pilihan.** JWT HS256 dengan peran `buyer` dan `organizer`. Register hanya membuat buyer, dan field `role` dari klien diabaikan. Akun organizer dibuat lewat seed.

**Trade-off.** Token stateless: middleware hanya memeriksa tanda tangan dan kedaluwarsa, tanpa membaca database. Akun yang dihapus tetap punya token berlaku sampai kedaluwarsa. Untuk skala ini cukup.

**Kode status.** Organizer lain yang membuka dashboard event mendapat **403**, karena keberadaan event sudah publik. Pembeli yang membuka pesanan orang lain mendapat **404**, karena keberadaan pesanan bersifat privat dan 403 justru membocorkannya.

---

## 12. Nginx

**Pilihan.** Nginx dipakai di container web: menyajikan hasil build frontend dan meneruskan `/api` ke API, supaya browser hanya berbicara dengan satu origin dan API tidak perlu CORS. Saat development, Vite melakukan hal yang sama lewat proxy-nya. Route SSE memakai `proxy_buffering off` supaya setiap pesan langsung diteruskan, dan `proxy_read_timeout 1h` supaya stream yang diam di antara heartbeat tidak diputus.

Load balancing dan rate limit per IP belum dipakai. Nginx hanya layak kalau ada frontend dan dua replika API: satu origin (tanpa CORS), load balancing, dan rate limit per IP. Biayanya satu komponen lagi dan konfigurasi khusus untuk SSE. Bukti bahwa kuota dijaga di database, bukan di memori aplikasi, sebenarnya datang dari dua replika, bukan dari Nginx.

Catatan kalau dua replika dipakai: saat ini setiap instance menjalankan migrasi saat start. Migrasi perlu dipindah ke satu service yang berjalan sekali.

---

## 13. Struktur repo: monorepo, modul per domain

**Monorepo** supaya `docker compose up` dan satu pipeline CI mencakup semuanya, dan penguji cukup clone satu repo.

**Modul per domain** (auth, events, orders, payments, tickets), dan di dalam tiap modul ada lapisan handler, service, queries, dan views. Batas transaksi selalu ada di service. Query menerima `Executor` (database atau transaksi), jadi bisa disusun di dalam satu `db.transaction`.

**Alur kerja.** Satu branch per modul, atomic commit dengan Conventional Commits, PR di-merge dengan rebase merge supaya riwayat per commit tetap terlihat di `main`. CI menjalankan test di setiap push dan PR, lalu membangun image dan mendorongnya ke GHCR dengan tag commit SHA di setiap push ke `main`.

---

## 14. Cara saya membuktikan sistem ini benar

Mengklaim "kode saya pakai transaksi, jadi aman" itu mudah. Saya ingin membuktikannya.

**Test ke PostgreSQL asli.** Semua integration test memakai Testcontainers, bukan mock, karena bug konkurensi hanya muncul di database sungguhan.

**Test konkurensi yang deterministik.** Race condition tidak saya uji dengan harapan "semoga bertabrakan". Test menahan satu transaksi di lock, menunggu sampai semua percobaan lain benar benar tertahan, lalu melepasnya. Interleaving terburuk dipaksa terjadi, jadi hasilnya sama di setiap run.

**Mutation testing.** Untuk setiap pengaman penting, saya mematikannya sementara dan memastikan test-nya gagal:

| Pengaman dimatikan | Akibat yang tertangkap |
|---|---|
| Advisory lock pembeli dan event | 6 dari 10 request lolos, satu pembeli memegang 12 tiket |
| Lock Idempotency-Key | Request kembar berakhir 500 |
| `status = 'PENDING'` di cancel | `reserved` jadi negatif |
| `status = 'PENDING'` di bayar | Tiket hampir terbit dua kali, 7 test gagal |
| `expires_at > now` di bayar | Pesanan kedaluwarsa bisa dibayar |
| `ON CONFLICT DO NOTHING` di webhook | Webhook ganda memicu error |
| Guard di subselect sweeper | Sweeper berhenti sebelum semua pesanan jatuh tempo diproses |

**Naive vs atomic.** Dengan kuota 1, strategi naive meloloskan 2 pesanan dan `reserved` tetap tercatat 1. Strategi atomic hanya meloloskan 1.

**Uji 200 pesanan dan invariant checker.** *(sedang dikerjakan)* 200 pembeli memesan bersamaan untuk kuota 100. Hasil yang diharapkan: tepat 100 terjual dengan atomic. Invariant checker lalu memeriksa bahwa `reserved` sama dengan jumlah pesanan PENDING, `sold` sama dengan jumlah pesanan PAID, dan jumlah tiket sama dengan `sold`.

---

---

## 15. Data demo lewat logika bisnis asli

**Pilihan.** Skrip `tools/demo-data/seed.mts` (`npm --prefix api run demo-data`) membuat event dan pesanan demo dengan memanggil `createApp` di dalam proses, bukan dengan menulis baris ke tabel. Pesanan EXPIRED dibuat pada jam yang dimundurkan 20 menit lalu disapu oleh sweeper asli.

**Alasan.** Data yang dibuat lewat jalur bisnis yang sama dengan pengguna nyata otomatis konsisten: counter `reserved` dan `sold`, tiket, dan invariant checker tetap OK. Data yang ditulis langsung ke tabel gampang melanggar invariant tanpa disadari, dan itu akan merusak demo yang justru membuktikan invariant. Skrip tidak jalan otomatis saat start, dan skrip uji beban tidak memakainya.

---

## Batasan yang diakui

- Batas 4 tiket berlaku per akun, bukan per orang.
- Waktu `now` pesanan diambil sebelum menunggu lock, jadi saat antrean lock panjang, waktu tahan bisa sedikit kurang dari 15 menit.
- Mode `naive` sengaja merusak invariant `reserved`, sehingga sweeper bisa macet karena CHECK menolak pengembalian kuota. Demo naive harus memakai database yang di-reset sebelum demo atomic.
- Payload webhook yang mengandung karakter NUL (`\u0000`) ditolak tipe `jsonb` dan berakhir 500.
- Token JWT tetap berlaku sampai kedaluwarsa walaupun akunnya dihapus.
- `GET /events` dan riwayat pesanan belum memakai paginasi.
- Token JWT di frontend disimpan di `localStorage` supaya sesi bertahan setelah reload. Skrip apa pun yang berjalan di halaman (misalnya lewat celah XSS) bisa membacanya.
