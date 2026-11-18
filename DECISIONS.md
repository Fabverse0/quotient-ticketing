# DECISIONS

Catatan keputusan desain Quotient. Setiap keputusan ditulis dengan format:
konteks, opsi yang dipertimbangkan, pilihan, trade-off, dan kapan pilihan ini jadi salah.

> Kerangka ini diisi oleh Fab dengan kata kata sendiri. Bahan riset ada di docs/RESEARCH.md.

## 1. Cara menjaga kuota tidak terjual lebih

- Konteks:
- Opsi:
- Pilihan:
- Trade-off:
- Kapan jadi salah:

## 2. Batas 4 tiket per pembeli

## 3. Kedaluwarsa pesanan 15 menit

## 4. State machine pesanan dan tiket yang tidak terbit dua kali

## 5. Simulasi pembayaran dan webhook idempoten

## 6. Idempotency-Key untuk pembuatan pesanan

## 7. Satu pesanan satu tipe tiket

## 8. PostgreSQL sebagai satu satunya sumber kebenaran (tanpa Redis)

## 9. Real time dengan SSE dan LISTEN/NOTIFY

## 10. Stack: Hono + TypeScript

## 11. Auth dengan JWT dan dua peran

## 12. Nginx (opsional)

## 13. Struktur repo: monorepo, modul per domain

## 14. Cara saya membuktikan sistem ini benar

Versi naif vs atomic, uji 200 pesanan paralel, invariant checker, simulator pembayaran kacau.

## Batasan yang diakui

- Batas 4 tiket berlaku per akun, bukan per orang.
