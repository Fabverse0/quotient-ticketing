# Uji beban: 200 pembeli, kuota 100

Cara paling mudah adalah skrip demo, yang menjalankan seluruh urutan naive lalu atomic di stack terpisah:

```bash
node tools/demo.mjs
```

Langkah-langkahnya bisa juga dijalankan satu per satu terhadap stack yang sudah hidup.

## 1. Seed

Membuat satu event (Reguler kuota 100) dan 200 akun pembeli lewat API, lalu menyimpan token mereka ke `tools/load-test/.data/seed.json` (di-gitignore).

```bash
API_URL=http://localhost:3000 ORGANIZER_EMAIL=organizer@quotient.local ORGANIZER_PASSWORD=... node tools/load-test/seed.mjs
```

`BUYERS` dan `QUOTA` bisa diubah lewat env.

## 2. k6 lewat Docker

200 VU mengirim `POST /orders` (1 tiket) bersamaan. k6 berjalan di jaringan compose dan memanggil API langsung di `http://api:3000`. Untuk stack dev, nama jaringannya `quotient_default`.

```bash
docker run --rm --network quotient_default \
  --mount "type=bind,source=$(pwd)/tools/load-test,target=/scripts" -w /scripts \
  -e API_URL=http://api:3000 -e RESULT_LABEL=manual \
  grafana/k6:2.3.0 run --quiet /scripts/orders.js
```

Di Git Bash pada Windows, tambahkan `MSYS_NO_PATHCONV=1` di depan perintah dan pakai `$(cygpath -w "$PWD/tools/load-test")` sebagai source.

Ringkasan jumlah 201, 409 `QUOTA_EXHAUSTED`, dan status lain dicetak di akhir dan disimpan ke `tools/load-test/results/k6-<label>.json` (di-gitignore).

## 3. Invariant checker

```bash
DATABASE_URL=postgres://quotient:quotient@localhost:5433/quotient npm --prefix api run invariants
```

Exit code 0 kalau semua OK, 1 kalau ada LANGGAR, 2 kalau pemeriksaan tidak bisa jalan. Tambahkan `-- --json` untuk keluaran JSON.
