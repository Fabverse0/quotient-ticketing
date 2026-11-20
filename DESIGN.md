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
| `--color-ash` | `#aaaaaa` | Garis, border, dan tanda non-teks. Tidak untuk teks (kontrasnya 2,1:1) |
| `--color-mist` | `#dddddd` | Border kolom isian |
| `--color-carbon` | `#252525` | Pita gelap di atas halaman detail event |

### Aksen dan status (sedikit, selalu bermakna)

| Token | Nilai | Tugas |
|---|---|---|
| `--color-umber` | `#945c26` | Aksen istimewa: segel LUNAS, kursi ditahan di peta kursi |
| `--color-sage` | `#5E6B4E` | Tersedia, OK, invariant lulus, indikator live |
| `--color-ochre` | `#B07D2B` | Garis dan border status menunggu bayar dan kursi tinggal sedikit (kurang dari 15) |
| `--color-ochre-text` | `#8c6221` | Teks status oker: menunggu bayar, kursi tinggal sedikit |
| `--color-oxblood` | `#7A2E2A` | Habis, kedaluwarsa, error, invariant LANGGAR, perlu refund |
| `--color-inkblue` | `#2F4858` | Tiket yang sudah lunas |

Aturan:
- Teks kecil yang dulu memakai ash memakai slate `#666666` (4,95:1 di latar wall). Teks status oker memakai `#8c6221` (4,66:1 di latar wall). Ash dan oker asli tetap untuk garis dan border. Semua teks memenuhi WCAG AA.
- Warna status hanya muncul di teks kecil, label, garis, dan border. Latar halaman tetap tulang, tombol utama tetap arang.
- Tidak ada warna lain di luar tabel ini.
- Tidak ada gradien, glow, atau glassmorphism.

### Dashboard organizer: warna tambahan

Hanya dashboard organizer yang memakai tint lembut di bawah ini. Semuanya turunan dari warna yang sudah ada, tanpa gradien dan tanpa cahaya.

| Token | Nilai | Dipakai untuk |
|---|---|---|
| `--color-inkblue` | `#2F4858` | Sidebar, kartu utama, dan Reguler di grafik |
| `--color-inkblue-deep` | `#243845` | Item sidebar aktif dan bayangan kartu utama |
| `--color-blue-mist` | `#B8C8D1` | Teks sekunder di atas inkblue (5,58:1) |
| `--color-blue-wash` | `#E2E8EB` | Latar kartu Reguler dan chip |
| `--color-clay` | `#E8DCCF` | Latar kartu VIP dan chip |
| `--color-sage-wash` | `#E3E7DA` | Latar status baik |
| `--color-umber-light` | `#E0B07A` | VIP dan ekor logo di atas inkblue (4,87:1) |

Perbandingan tipe tiket selalu sama: Reguler inkblue, VIP umber.

## Tipografi

| Peran | Font | Bobot | Catatan |
|---|---|---|---|
| Judul dan angka besar | **Marcellus** (Google Fonts) | 400 | Serif humanis bergaya Optima. Hanya satu bobot, jadi ketegasan datang dari ukuran, huruf kapital, dan spasi huruf |
| Teks, tombol, label, form | **Hanken Grotesk** (Google Fonts) | 400, 700 | Pengganti gratis untuk Suisse Int'l |
| Kode tiket | Monospace sistem | 400 | |

Alasan: Marcellus memberi karakter klasik dan dikurasi, Hanken Grotesk menjaga kesan bersih dan netral.

Skala:
- Label kecil kapital: 11px, `letter-spacing: 0.14em`, `text-transform: uppercase`, warna slate
- Label section: Marcellus 13px, warna slate
- Keterangan: 12 sampai 13px
- Teks: 14 sampai 15px, line-height 1.6
- Paragraf pembuka: 20px, warna graphite, rata tengah, lebar maksimal sekitar 460px
- Judul halaman: Marcellus 28 sampai 30px
- Judul pita gelap: Marcellus 40px, kapital, `letter-spacing: 0.06em`
- Angka dashboard: Hanken Grotesk 700, 44px, `tabular-nums`

Bold (700) hanya untuk harga dan tombol utama, dan untuk dashboard organizer: angka besar, nama event, dan judul panel memakai Hanken Grotesk 700 supaya terbaca tegas sebagai data, bukan Marcellus. Tulisan QUOTIENT di logo adalah pengecualian: Marcellus kapital yang diubah menjadi path dan ditebalkan, bukan teks, lihat bagian Logo. Semua angka memakai `font-variant-numeric: tabular-nums`.

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
- **Ornamen tiket**: tiket dengan lekukan di kedua sisi, perforasinya menjadi garis tanda bagi. Versi garis tipis berwarna ash untuk state kosong (belum ada event, pesanan, atau tiket). Dipakai dengan `currentColor`, jangan diwarnai dengan warna status.
- **Label kecil bernomor dan kapital** seperti "No. 01", "Lot 2026/12", "Formularium pertunjukan".

## Halaman

### Navigasi
Logo Quotient di kiri: simbol, dan mulai lebar `sm` ditambah tulisan QUOTIENT. Di ponsel hanya simbol. Tautan teks di kanan, 14px: pembeli melihat Event, Pesanan, Tiket saya, dan Keluar; organizer melihat Event saya, Buat event, dan Keluar; tamu melihat Event dan Masuk; nama akun tampil di layar lebar, warna slate, tanpa latar dan tanpa border.

### Daftar event (pembeli)
- Paragraf pembuka sebagai hero, tanpa judul besar dan tanpa tombol.
- Label section Marcellus kecil, lalu **grid tile galeri tiga kolom** (dua kolom di tablet, satu di ponsel).
- Setiap tile: kartu wall dengan sampul buram kecil di tengah dan bayangan hangat. Di bawah, satu baris: nama event di kiri, sisa kursi di kanan dengan warna status (slate kalau masih banyak, oker teks `#8c6221` kalau tinggal sedikit, oxblood kalau habis).

### Detail event dan pemesanan
- Pita gelap karbon di atas: simbol logo kecil di tengah (bagian cincin berwarna canvas, ekor tetap umber), label kecil, nama event Marcellus kapital besar, tanggal dan tempat.
- Dua kolom: kiri label berbingkai ganda berisi sisa kursi (Marcellus besar) dan peta kursi dengan keterangan; kanan daftar harga bergaris titik, pemilih dosis, tombol "Pesan 2 tiket · Rp150.000", dan keterangan "Kursi ditahan selama 15 menit. Maksimal empat tiket untuk setiap akun."
- Tipe yang habis tampil abu abu dengan keterangan oxblood "Habis".

### Pesanan aktif
Kartu dengan hitung mundur besar dalam Marcellus (menit:detik), label status oker (teks `#8c6221`, border oker) "Menunggu bayar", tombol "Bayar sekarang" dan tautan "Batalkan pesanan". Saat waktu habis, label berubah oxblood "Kedaluwarsa" dan keterangan "Waktu bayar habis. Kursi sudah dilepas untuk pembeli lain."

### Tiket saya
Satu kartu per kursi, berbingkai ganda dengan bayangan hangat: segel LUNAS di pojok kanan atas, label "Tiket · Lot · Kursi 1 dari 2", nama event Marcellus kapital, tipe dan waktu, garis sobek putus putus, lalu kode tiket monospace dan QR code.

### Riwayat pesanan
Daftar baris dengan garis tipis, bukan kartu. Nama event, jumlah tiket, label status berwarna, dan waktu.

### Area organizer: shell, Ringkasan, Analitik

Area organizer (`/organizer/*`) punya wajah sendiri, terpisah dari halaman pembeli. Sudut besar dan tint lembut hanya berlaku di sini (lihat "Dashboard organizer: warna tambahan").

- **Shell**: rail ikon di kiri (inkblue, sudut 28px, lebar 96px, menempel saat gulir) berisi logo, Ringkasan, Analitik, Event saya, Buat event, lalu inisial akun dan Keluar. Item aktif berlatar canvas. Di ponsel rail menjadi bilah di bawah dengan item yang sama. Isi halaman berada di satu panel besar berlatar field.
- **Ringkasan** (`/organizer`): sapaan sesuai jam WIB, lalu kartu utama inkblue: jumlah tiket terjual seluruh event dengan hitung naik, tiga angka pendukung (pendapatan dari pesanan lunas, ditahan, sisa), dan cincin terisi yang dibagi Reguler dan VIP. Di bawahnya: kartu Reguler dibanding VIP (terjual, kuota, pendapatan, porsi pendapatan), kartu Penjualan per event (batang Reguler dan VIP berdampingan, terjual terhadap kuota masing-masing), dan kartu Event berikutnya.
- **Analitik** (`/organizer/event/:id`, `/organizer/analitik` membuka event terdekat yang belum mulai): judul, indikator status, dan pemilih event. Kartu utama inkblue berisi nama event, waktu, tempat, empat angka (terjual, ditahan, sisa, pendapatan), dan cincin. Lalu satu kartu untuk Reguler dan satu untuk VIP berdampingan (kuota, terjual, ditahan, sisa, batang, peta kursi besar), grafik "Tiket terjual dari waktu ke waktu" (batang per periode, Reguler inkblue dan VIP umber berdampingan, tiap batang berangka) bersama kartu "Status pesanan" (batang per status dengan jumlah pesanan dan kursi, serta berapa persen pesanan yang lunas), lalu panel pemeriksaan invariant dan pesanan terbaru. Grafik hanya memakai data pesanan yang tercatat, tanpa angka perkiraan.
- **Indikator status**: satu titik yang menandai keadaan nyata: sage "Diperbarui langsung", oker saat polling 10 detik, oxblood saat pembaruan berhenti. Tidak berdenyut dan tidak bercahaya.
- **Pembanding tipe tiket**: Reguler selalu inkblue dan VIP selalu umber, di batang, cincin, dan kartu. Setiap grafik punya padanan teks (angka di sampingnya atau `aria-label`), jadi warna bukan satu-satunya pembeda.
- **Panel pemeriksaan invariant**: judul, satu kalimat penjelasan, dan tombol "Jalankan pemeriksaan" di bawahnya (inkblue dengan ikon perisai, tetap manual). Enam pemeriksaan selalu terlihat dengan kalimat biasa dan rumusnya, berstatus "Belum diperiksa" sebelum dijalankan. Sesudahnya muncul ringkasan bercincin ganda: sage "Semua cocok" atau oxblood "N pemeriksaan dilanggar", jumlah yang lulus, dan waktu periksa. Setiap baris menampilkan status dengan ikon dan teks serta angka yang dibandingkan lengkap dengan namanya (`ditahan 7 = pesanan menunggu 7`). Yang dilanggar berwarna oxblood dan merinci tipe tiketnya, dan panel mendapat garis oxblood.
- **Gerak**: kartu muncul bergantian sekali saat halaman dibuka (naik 16px sambil memudar, selang 90ms, 1,2 detik), angka naik dengan hitung halus, dan batang serta cincin tumbuh dari nol. Hanya `transform` dan `opacity`, kecuali panjang busur cincin (`stroke-dasharray`). Mati saat pengguna memilih gerak dikurangi. Tidak ada gerak yang berulang terus.

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
- Komponen dasar (Button, Field, StatusLabel, Tile, SeatMap, DoseSelector, Seal, LiveNumber, Reveal, Logo) dibuat sekali dan dipakai ulang, supaya perubahan desain cukup dilakukan di satu tempat.

## State wajib

Setiap tampilan data punya state kosong, loading, dan error. Kalimat untuk state khas Quotient:

| Situasi | Pesan |
|---|---|
| Kursi habis saat tombol ditekan | "Kursi baru saja habis. Sisa kuota sudah diperbarui." |
| Batas 4 tiket | "Batas 4 tiket per akun untuk event ini sudah tercapai." |
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

Logo membawa satu gagasan: hasil bagi. Satu cincin dibagi empat sama besar, tiga bagian tinggal di tempatnya, dan yang keempat pergi sebagai ekor huruf Q, seperti satu kursi yang diambil pembeli. Angka empat sama dengan batas empat tiket per pembeli.

- **Simbol**: tiga bagian cincin berwarna `ink`, ekor berwarna `umber`. Di ukuran 16 sampai 48 piksel (favicon) dipakai versi kecil dengan cincin lebih tebal dan celah lebih lebar.
- **Tulisan**: QUOTIENT dalam Marcellus kapital berspasi 0,06 em, diubah menjadi path dan ditebalkan 34 unit dari 2.048 per sisi supaya tebal tanpa font lain. Hanya dipakai di logo. Teks "Quotient" di tempat lain tetap Marcellus biasa.
- **Lockup**: simbol di kiri, tulisan di kanan, tinggi simbol sekitar 2,2 kali tinggi huruf kapital.
- **Varian**: putih untuk latar gelap (pita gelap detail event), hitam atau arang untuk satu warna.
- **Di kode**: `web/src/components/Logo.tsx` (`Logo`, `LogoMark`, `Wordmark`, `TicketOrnament`), bentuknya dari `logoShapes.ts` yang dibuat dari `docs/logo/final/`.
- Sumber, ekspor, aturan pakai, dan lisensi font ada di `docs/logo/README.md`. Enam konsep awal ada di `docs/logo/concepts/`.
- Jangan membuat logo lain tanpa persetujuan.
