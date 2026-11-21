# Uji beban: 200 pembeli, kuota 100

Cara paling mudah adalah skrip demo, yang menjalankan seluruh urutan naive lalu atomic di stack terpisah:

```bash
node tools/demo.mjs
```

Langkah-langkahnya bisa juga dijalankan satu per satu terhadap stack yang sudah hidup.

## 1. Seed

Membuat satu event (Reguler kuota 100) dan 200 akun pembeli lewat API, lalu menyimpan token mereka ke `tools/load-test/.data/seed.json` (di-gitignore).

```powershell
$env:API_URL="http://localhost:3000"; $env:ORGANIZER_EMAIL="admin@gmail.com"; $env:ORGANIZER_PASSWORD="admin123"; node tools/load-test/seed.mjs
```

`BUYERS` dan `QUOTA` bisa diubah lewat env.

## 2. k6 lewat Docker

200 VU mengirim `POST /orders` (1 tiket) bersamaan. k6 berjalan di jaringan compose dan memanggil API langsung di `http://api:3000`. Untuk stack dev, nama jaringannya dikunci di `docker-compose.yml` menjadi `quotient_default`, apa pun nama folder clone-nya. `tools/demo.mjs` menimpanya dengan `quotient-demo_default` supaya stack demo tidak berbagi jaringan dengan stack dev.

```powershell
docker run --rm --network quotient_default --mount "type=bind,source=$PWD\tools\load-test,target=/scripts" -w /scripts -e API_URL=http://api:3000 -e RESULT_LABEL=manual grafana/k6:2.3.0 run --quiet /scripts/orders.js
```

Perintah ini dijalankan dari root repo. Di Git Bash atau Linux, ganti `$PWD\tools\load-test` dengan `$(pwd)/tools/load-test`.

Ringkasan jumlah 201, 409 `QUOTA_EXHAUSTED`, dan status lain dicetak di akhir dan disimpan ke `tools/load-test/results/k6-<label>.json` (di-gitignore).

## 3. Invariant checker

```powershell
$env:DATABASE_URL="postgres://quotient:quotient@localhost:5433/quotient"; npm --prefix api run invariants
```

Exit code 0 kalau semua OK, 1 kalau ada LANGGAR, 2 kalau pemeriksaan tidak bisa jalan. Tambahkan `-- --json` untuk keluaran JSON.
