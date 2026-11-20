# Alur webhook pembayaran

`POST /webhooks/payment` tanpa JWT. Semua event yang tercatat dibalas 200 supaya penyedia berhenti mengirim ulang.

```mermaid
sequenceDiagram
    autonumber
    participant P as Penyedia pembayaran
    participant API as API (webhook handler + service)
    participant DB as PostgreSQL

    P->>API: POST /webhooks/payment, X-Signature: HMAC-SHA256 hex dari body mentah
    API->>API: batasi body 64 KB, hitung HMAC, bandingkan timingSafeEqual
    alt signature salah
        API-->>P: 401 INVALID_SIGNATURE (tidak dicatat)
    end
    API->>API: parse JSON dan validasi payload
    alt JSON rusak atau payload tidak valid
        API-->>P: 400 (tidak dicatat)
    end
    API->>DB: BEGIN
    API->>DB: INSERT processed_events ON CONFLICT (event_id) DO NOTHING RETURNING

    alt event_id sudah ada (duplikat)
        API->>DB: baca outcome yang tersimpan
        API->>DB: COMMIT
        API-->>P: 200 duplicate true dengan outcome yang tersimpan
        Note over API: Payload berbeda dari yang tersimpan tetap dianggap<br/>duplikat, hanya dicatat dengan console.warn.
    else event_id baru
        alt event_type selain payment.succeeded dan payment.failed
            API->>DB: outcome IGNORED
        else pesanan tidak ada
            API->>DB: outcome ORDER_NOT_FOUND (juga untuk payment.failed)
        else payment.failed
            API->>DB: outcome PAYMENT_FAILED, pesanan tidak diubah
        else amount tidak sama dengan total_price
            API->>DB: outcome AMOUNT_MISMATCH, pesanan tetap PENDING
        else payment.succeeded
            API->>DB: UPDATE orders SET status PAID WHERE status PENDING AND expires_at > now RETURNING
            alt menang (1 baris)
                API->>DB: reserved ke sold, terbitkan tiket seq 1..q
                API->>DB: outcome PAID
            else pesanan sudah PAID
                API->>DB: outcome ALREADY_PAID
            else webhook terlambat
                Note over API,DB: PENDING lewat expires_at: UPDATE WHERE status PENDING AND<br/>expires_at <= now, lalu reserved dikembalikan.<br/>EXPIRED atau CANCELLED: UPDATE WHERE status IN EXPIRED, CANCELLED,<br/>kuota tidak disentuh.
                API->>DB: status REFUND_REQUIRED
                API->>DB: outcome REFUND_REQUIRED atau ALREADY_REFUND_REQUIRED
            end
        end
        API->>DB: UPDATE processed_events SET outcome
        API->>DB: COMMIT
        API-->>P: 200 received true, duplicate false, outcome
    end
```

## Urutan pemeriksaan untuk event baru

Pesanan dicari lebih dulu, jadi `payment.failed` untuk pesanan yang tidak dikenal dicatat `ORDER_NOT_FOUND`, bukan `PAYMENT_FAILED`. Setelah itu `payment.failed`, lalu pencocokan `amount`, baru `payment.succeeded` diproses.

## Kenapa gerbang dedupe paling awal

Dua salinan event yang sama yang datang bersamaan bertemu di primary key `processed_events.event_id`. Salinan kedua menunggu transaksi pertama selesai, lalu `DO NOTHING` membuatnya tidak mengembalikan baris dan ia menjawab sebagai duplikat. Hanya satu salinan yang pernah memproses pesanan.

Kalau transaksi webhook gagal, baris `processed_events` ikut di-rollback, jadi retry dari penyedia diproses ulang.
