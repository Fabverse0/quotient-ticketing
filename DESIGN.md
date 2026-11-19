# DESIGN

Arah desain frontend Quotient. File ini dibaca bersama aturan antislop: DESIGN.md memberi arah, antislop menyaring.

Dial antislop: **ENERGY 1 / RHYTHM 2 / MOTION 2**.

## Identitas

Quotient berarti hasil bagi: kursi yang terbatas dibagi dengan cermat ke banyak pembeli. Rasanya seperti **galeri yang tenang di cahaya musim dingin, dengan ketelitian sebuah formularium**: latar tulang yang hangat, ruang kosong yang lega, tipografi yang dikurasi, dan detail kecil yang presisi.

Desain ini menggabungkan dua referensi:
- **Galeri** (portofolio bergaya galeri): latar tulang, sudut 5px, tile dengan bayangan cokelat hangat, grid yang lega, dan animasinya.
- **Formularium** (toko premium bergaya apotek): pasangan judul serif humanis dan teks sans netral, bingkai garis ganda, garis titik, label kecil bernomor, dan segel.

Ini terinspirasi, bukan meniru. Tidak memakai nama, logo, atau aset dari merek mana pun.

## Palet

### Netral (dominan)

| Token | Nilai | Dipakai untuk |
|---|---|---|
| `--color-canvas` | `#f4f3f1` | Latar halaman |
| `--color-wall` | `#efeeeb` | Kartu tile galeri, panel dashboard, sisi kiri halaman auth |
| `--color-field` | `#f9f8f6` | Latar kolom isian |
| `--color-ink` | `#333333` | Teks utama, tombol utama, bingkai |
| `--color-graphite` | `#4d4d4d` | Paragraf panjang |
| `--color-slate` | `#666666` | Teks sekunder |
| `--color-ash` | `#aaaaaa` | Label kecil, tautan navigasi, keterangan |
| `--color-mist` | `#dddddd` | Border kolom isian |
| `--color-carbon` | `#252525` | Pita gelap di atas halaman detail event |

### Aksen dan status (sedikit, selalu bermakna)

| Token | Nilai | Tugas |
|---|---|---|
| `--color-umber` | `#945c26` | Aksen istimewa: segel LUNAS, kursi ditahan di peta kursi |
| `--color-sage` | `#5E6B4E` | Tersedia, OK, invariant lulus, indikator live |
| `--color-ochre` | `#B07D2B` | Menunggu bayar, kursi tinggal sedikit (kurang dari 15) |
| `--color-oxblood` | `#7A2E2A` | Habis, kedaluwarsa, error, invariant LANGGAR, perlu refund |
| `--color-inkblue` | `#2F4858` | Tiket yang sudah lunas |

Aturan:
- Warna status hanya muncul di teks kecil, label, garis, dan border. Latar halaman tetap tulang, tombol utama tetap arang.
- Tidak ada warna lain di luar tabel ini.
- Tidak ada gradien, glow, atau glassmorphism.

## Tipografi

| Peran | Font | Bobot | Catatan |
|---|---|---|---|
| Judul dan angka besar | **Marcellus** (Google Fonts) | 400 | Serif humanis bergaya Optima. Hanya satu bobot, jadi ketegasan datang dari ukuran, huruf kapital, dan spasi huruf |
| Teks, tombol, label, form | **Hanken Grotesk** (Google Fonts) | 400, 700 | Pengganti gratis untuk Suisse Int'l |
| Kode tiket | Monospace sistem | 400 | |

Alasan: Marcellus memberi karakter klasik dan dikurasi, Hanken Grotesk menjaga kesan bersih dan netral.

Skala:
- Label kecil kapital: 11px, `letter-spacing: 0.14em`, `text-transform: uppercase`, warna ash
- Label section: Marcellus 13px, warna ash
- Keterangan: 12 sampai 13px
- Teks: 14 sampai 15px, line-height 1.6
- Paragraf pembuka: 20px, warna graphite, rata tengah, lebar maksimal sekitar 460px
- Judul halaman: Marcellus 28 sampai 30px
- Judul pita gelap: Marcellus 40px, kapital, `letter-spacing: 0.06em`
- Angka dashboard: Marcellus 44px

Bold (700) hanya untuk harga dan tombol utama. Semua angka memakai `font-variant-numeric: tabular-nums`.

## Bentuk dan ruang

- **Sudut 5px** untuk tombol, kolom isian, kartu, panel, dan tile. Sampul di dalam tile 4px. Label status 3px. Tidak ada sudut yang lebih besar.
- **Bayangan hanya untuk sampul dan kartu tiket**, selalu cokelat hangat:
  - Diam: `0 5px 15px rgba(90,50,40,.15), 0 4px 8px rgba(80,40,30,.1)`
  - Terangkat: `0 5px 10px rgba(100,60,50,.1), 0 15px 25px rgba(100,60,50,.4)`
- Tidak ada bayangan di teks, navigasi, panel, atau tombol.
- Ruang antar section lega (sekitar 64 sampai 120px). Jarak antar elemen 14 sampai 20px.

## Motif

- **Sampul buram otomatis.** Setiap event punya sampul dari beberapa bidang warna tanah yang diburamkan (`filter: blur(7px)`), dipilih dari hash ID event supaya selalu konsisten. Tidak ada judul di atas sampul. Event yang habis ditampilkan keabuan dan sedikit pudar.
- **Bingkai garis ganda** untuk label penting (komposisi kursi di halaman detail, kartu tiket).
- **Garis titik** untuk daftar harga dan pemeriksaan invariant, misalnya `Reguler ......... Rp75.000`.
- **Peta kursi**: satu kotak kecil per kursi. Arang untuk terjual, umber untuk ditahan, kosong dengan border tipis untuk tersedia.
- **Pemilih dosis**: empat kotak bersebelahan (1, 2, 3, 4) untuk jumlah tiket, langsung memperlihatkan batas 4 tiket.
- **Segel LUNAS**: lingkaran ganda umber yang sedikit miring, hanya di tiket yang sudah lunas.
- **Label kecil bernomor dan kapital** seperti "No. 01", "Lot 2026/12", "Formularium pertunjukan".

## Halaman

### Navigasi
Monogram "Q" di dalam lingkaran tipis di kiri. Tautan teks di kanan (Event, Tiket saya, Masuk atau nama akun), 14px, warna ash, tanpa latar dan tanpa border.

### Daftar event (pembeli)
- Paragraf pembuka sebagai hero, tanpa judul besar dan tanpa tombol.
- Label section Marcellus kecil, lalu **grid tile galeri tiga kolom** (dua kolom di tablet, satu di ponsel).
- Setiap tile: kartu wall dengan sampul buram kecil di tengah dan bayangan hangat. Di bawah, satu baris: nama event di kiri, sisa kursi di kanan dengan warna status (ash kalau masih banyak, oker kalau tinggal sedikit, oxblood kalau habis).

### Detail event dan pemesanan
- Pita gelap karbon di atas: label kecil, nama event Marcellus kapital besar, tanggal dan tempat.
- Dua kolom: kiri label berbingkai ganda berisi sisa kursi (Marcellus besar) dan peta kursi dengan keterangan; kanan daftar harga bergaris titik, pemilih dosis, tombol "Pesan 2 tiket · Rp150.000", dan keterangan "Kursi ditahan selama 15 menit. Maksimal empat tiket untuk setiap akun."
- Tipe yang habis tampil abu abu dengan keterangan oxblood "Habis".

### Pesanan aktif
Kartu dengan hitung mundur besar dalam Marcellus (menit:detik), label status oker "Menunggu bayar", tombol "Bayar sekarang" dan tautan "Batalkan pesanan". Saat waktu habis, label berubah oxblood "Kedaluwarsa" dan keterangan "Waktu bayar habis. Kursi sudah dilepas untuk pembeli lain."

### Tiket saya
Satu kartu per kursi, berbingkai ganda dengan bayangan hangat: segel LUNAS di pojok kanan atas, label "Tiket · Lot · Kursi 1 dari 2", nama event Marcellus kapital, tipe dan waktu, garis sobek putus putus, lalu kode tiket monospace dan QR code.

### Riwayat pesanan
Daftar baris dengan garis tipis, bukan kartu. Nama event, jumlah tiket, label status berwarna, dan waktu.

### Dashboard organizer
- Label "Dashboard organizer", nama event Marcellus, indikator sage "Diperbarui langsung".
- Tab tipe tiket dengan garis bawah tipis.
- Panel wall berisi empat angka Marcellus besar (kuota, terjual, ditahan, sisa) dan peta kursi besar dengan keterangan.
- Panel pemeriksaan invariant bergaris titik, misalnya `reserved = pesanan menunggu .... 7 = 7`. Hasil sage "Semua cocok" atau oxblood dengan garis panel oxblood kalau ada pelanggaran. Tombol "Jalankan pemeriksaan".
- Panel pesanan terbaru: pembeli, jumlah, label status, waktu.
- Tidak ada tile galeri dan sampul di dashboard. Organizer membaca angka.

### Buat event (organizer)
Form satu kolom: nama, deskripsi, tempat, waktu, lalu dua kotak tipe tiket (Reguler dan VIP) berdampingan, masing masing harga dan kuota.

### Masuk dan daftar
Dua kolom: kiri sampul buram dengan bayangan hangat di atas latar wall, kanan formulir. Tab Masuk dan Daftar dengan garis bawah. Judul "Selamat datang kembali" atau "Buat akun pembeli". Keterangan di bawah: "Akun organizer dibuat oleh admin. Pendaftaran di sini hanya untuk pembeli." Di ponsel, sampul disembunyikan.

## Komponen dasar

- **Tombol utama**: latar arang, teks tulang, sudut 5px, tinggi 44px, hover menggelap ke `#121212`. Satu tombol utama per layar.
- **Tombol sekunder**: transparan, border 1px `#dddddd`, sudut 5px, hover latar `#f5f5f5`.
- **Kolom isian**: tinggi 40px, latar field, border mist, sudut 5px, label 12px di atas, placeholder berupa contoh nyata. Fokus: border arang dan cincin tipis. Error: border oxblood dan pesan 12px oxblood di bawah kolom.
- **Label status**: huruf kapital 10 sampai 11px, border 1px warna status, sudut 3px, tanpa latar (kecuali "Perlu refund" yang terisi oxblood).
- **Tautan teks**: garis bawah tipis `rgba(0,0,0,.15)` yang menyusut saat hover.

## Animasi

Semua animasi hanya menggerakkan `transform` dan `opacity`. Tanpa library animasi.

| Token | Nilai |
|---|---|
| `--dur-fast` | `0.3s` |
| `--dur-lift` | `0.4s` |
| `--dur-enter` | `0.85s` |
| `--dur-shake` | `0.75s` |
| `--lift-distance` | `-10px` |
| `--enter-distance` | `20px` |
| `--ease` | `ease` |

| Animasi | Implementasi | Dipakai di |
|---|---|---|
| Muncul saat di-scroll | Komponen `<Reveal>` dengan IntersectionObserver, berhenti mengamati setelah muncul. `opacity` 0 ke 1 dan `translateY(20px)` ke 0, jeda bertahap kecil antar item | Tile event, panel dashboard, section halaman detail |
| Sampul terangkat | Class `.lift`: sampul naik 10px. Bayangan terangkat ada di lapisan terpisah (pseudo-element) yang hanya dinaikkan `opacity`-nya, supaya `box-shadow` tidak dianimasikan | Tile event, kartu tiket |
| Keterangan berganti | Class `.swap`: teks kanan bawah memudar dan digantikan "Lihat event" | Tile event |
| Getar | Hook `useShake()`, keyframes `translateX` -8, 6, -4, 2, 0 piksel | Form error, kuota habis, batas 4 tiket, pesanan kedaluwarsa, invariant LANGGAR |
| Angka live | Komponen `<LiveNumber>`: fade singkat saat angka berganti, tanpa menghitung naik turun | Sisa kursi dan angka dashboard dari SSE |
| Kursi terisi | Transisi warna singkat pada kotak peta kursi | Dashboard dan halaman detail |
| Tautan | Garis bawah menyusut, warna teks menggelap | Navigasi dan tautan teks |

Aturan:
- Semua animasi mati di `prefers-reduced-motion: reduce`.
- Efek hover dimatikan di layar sentuh dan lebar di bawah 768px.

## Performa

Web harus ringan, termasuk di ponsel kelas menengah.

- **Blur sampul dipertahankan**, dengan cara yang ringan: `filter: blur()` hanya di lapisan sampul yang tidak pernah dianimasikan, yang bergerak saat hover hanya bingkai luarnya lewat `transform`. Pakai `contain: paint` di setiap tile, `will-change: transform` hanya saat hover, dan radius blur tetap sekitar 7 sampai 8px.
- Font: Marcellus satu bobot, Hanken Grotesk dua bobot, subset Latin, `font-display: swap`.
- Tanpa gambar besar. Sampul dibuat dari bidang warna, ikon dari SVG kecil.
- Library seperlunya: React, router, TanStack Query. Tanpa library UI atau animasi besar.
- Target JavaScript di bawah sekitar 150 KB setelah dikompres.
- Angka performa hanya dicantumkan di README kalau benar benar diukur.

## Token dan struktur kode

- Semua nilai desain (warna, font, sudut, bayangan, durasi animasi) disimpan sebagai token di satu file, misalnya `web/src/styles/tokens.css`, atau di tema Tailwind kalau memakai Tailwind.
- Komponen tidak boleh menulis nilai mentah seperti `#f4f3f1` atau `5px`, selalu lewat token.
- Komponen dasar (Button, Field, StatusLabel, Tile, SeatMap, DoseSelector, Seal, LiveNumber, Reveal) dibuat sekali dan dipakai ulang, supaya perubahan desain cukup dilakukan di satu tempat.

## State wajib

Setiap tampilan data punya state kosong, loading, dan error. Kalimat untuk state khas Quotient:

| Situasi | Pesan |
|---|---|
| Kursi habis saat tombol ditekan | "Kursi baru saja habis. Sisa kuota sudah diperbarui." |
| Batas 4 tiket | "Kamu sudah memegang 4 tiket untuk event ini." |
| Pesanan kedaluwarsa | "Waktu bayar habis. Kursi sudah dilepas untuk pembeli lain." |
| Database sibuk (503) | "Sistem sedang ramai. Coba lagi beberapa detik." |
| Login gagal | "Email atau password tidak cocok." |
| Belum ada event | "Belum ada event yang dibuka. Cek lagi nanti." |
| Belum punya tiket | "Tiket yang kamu bayar akan muncul di sini." |
| Loading | Kerangka abu abu lembut dengan bentuk yang sama seperti kontennya |

## Bahasa

- Antarmuka berbahasa Indonesia, sentence case, tanpa tanda seru.
- Tombol berupa kata kerja yang spesifik: "Pesan 2 tiket", "Bayar sekarang", "Batalkan pesanan", "Lihat tiket", "Jalankan pemeriksaan".
- Tidak ada angka, testimoni, atau klaim yang tidak berasal dari data sungguhan.
- Tidak memakai tanda pisah panjang di teks.

## Logo

Belum ada logo. Pakai monogram "Q" dalam lingkaran tipis dan nama "Quotient" sebagai teks dalam Marcellus. Jangan membuat logo lain tanpa persetujuan.
