# Logo Quotient

Logo ini punya satu gagasan: **hasil bagi**. Satu cincin (kuota) dibagi empat sama besar. Tiga bagian tinggal di tempatnya, dan yang keempat pergi sebagai ekor huruf Q, seperti satu kursi yang diambil pembeli. Angka empat sengaja sama dengan batas empat tiket per pembeli.

## Isi folder

| Berkas | Fungsi |
|---|---|
| `final/quotient-symbol.svg` | Simbol utama (cincin tiga bagian, ekor umber) |
| `final/quotient-symbol-small.svg` | Simbol untuk 16 sampai 48 piksel: cincin lebih tebal, celah lebih lebar. Sumber favicon |
| `final/quotient-wordmark.svg` | Tulisan QUOTIENT, Marcellus kapital yang sudah diubah menjadi path dan ditebalkan |
| `final/quotient-lockup-horizontal.svg` | Simbol di kiri, tulisan di kanan |
| `final/ornament-ticket-solid.svg`, `final/ornament-ticket-line.svg` | Ornamen tiket dengan perforasi sebagai tanda bagi, untuk dipakai di halaman. Memakai `currentColor` |
| `final/variants/` | Hitam, putih, dan arang untuk simbol, tulisan, dan lockup |
| `final/web-icons/` | `favicon.ico`, PNG 16/32/48, ikon sentuh Apple, ikon 192 dan 512, maskable, `site.webmanifest` |
| `concepts/` | Enam konsep awal dan perbandingan tulisan (huruf stensil geometris vs Marcellus). Riwayat keputusan, bukan untuk dipakai |

## Warna

| Bagian | Warna | Token |
|---|---|---|
| Tiga bagian cincin dan tulisan | `#333333` | `--color-ink` |
| Ekor Q | `#945c26` | `--color-umber` |

Di latar gelap dipakai varian putih (satu warna). Di tempat yang hanya mengizinkan satu warna dipakai varian hitam atau arang.

## Aturan pakai

- Di ukuran 16 sampai 48 piksel pakai `quotient-symbol-small.svg`, bukan simbol utama. Celah di simbol utama menutup di ukuran itu.
- Tulisan bergambar dipakai di tempat besar (kepala halaman, pita gelap, dokumen). Teks "Quotient" di tempat lain tetap Marcellus biasa.
- Jangan memutar, memiringkan, mengubah proporsi, atau mengganti warna ekor.
- Ruang kosong di sekeliling logo minimal setinggi satu bagian cincin (sekitar seperempat tinggi simbol).

## Asal tulisan dan lisensi font

Tulisan dibuat dari font **Marcellus** (Brian J. Bonislawsky, Astigmatic), lisensi SIL Open Font License 1.1, teks lisensi di `OFL-Marcellus.txt`. Hurufnya diubah menjadi bentuk vektor dan ditebalkan 34 unit dari 2.048 per sisi (sekitar 1,7 persen tinggi em). Karena sudah dimodifikasi, hasilnya tidak disebarkan sebagai font dan tidak memakai nama "Marcellus".

## Cara berkas dibuat

Dibuat dengan skill `logo-design` (`.claude/skills/logo-design/`). Pustaka 1.400 logo merek lain bawaan skill itu tidak ikut di repositori karena merupakan merek dagang pemiliknya. Semua gambar di sini dibuat dari nol, bukan dari pustaka itu.
