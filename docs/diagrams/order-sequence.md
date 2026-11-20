# Alur pembuatan pesanan

`POST /orders` dari request sampai commit dan notifikasi real time. Semua langkah database di antara `BEGIN` dan `COMMIT` adalah satu transaksi (READ COMMITTED).

```mermaid
sequenceDiagram
    autonumber
    actor Buyer as Pembeli (browser)
    participant API as API (handler + service)
    participant DB as PostgreSQL
    participant L as Koneksi LISTEN (hub)
    participant SSE as Klien SSE

    Buyer->>API: POST /orders {ticketTypeId, quantity}, Idempotency-Key opsional
    API->>API: cek JWT (peran buyer), validasi body (Zod)
    API->>DB: BEGIN
    opt ada Idempotency-Key
        API->>DB: advisory lock untuk (buyer, key)
        API->>DB: SELECT idempotency_keys
        alt key ada dengan body sama
            API-->>Buyer: 200 pesanan lama (replay)
        else key ada dengan body beda
            API-->>Buyer: 422 IDEMPOTENCY_KEY_REUSED
        end
    end
    API->>DB: SELECT tipe tiket dan event
    alt tipe tiket tidak ada
        API-->>Buyer: 404 TICKET_TYPE_NOT_FOUND
    else event sudah dimulai
        API-->>Buyer: 409 EVENT_ALREADY_STARTED
    end
    API->>DB: pg_advisory_xact_lock(buyer, event)
    API->>DB: hitung tiket PENDING + PAID milik pembeli di event ini
    alt aktif + quantity lebih dari 4
        API-->>Buyer: 409 BUYER_LIMIT_EXCEEDED
    end
    API->>DB: UPDATE ticket_types SET reserved = reserved + q WHERE id AND sold + reserved + q <= quota RETURNING
    Note over DB: Atomic conditional update. Penulis lain yang memegang baris<br/>membuat UPDATE ini menunggu, lalu WHERE dievaluasi ulang.
    alt 0 baris
        API-->>Buyer: 409 QUOTA_EXHAUSTED (ROLLBACK)
    end
    Note over DB: Trigger ticket_types_quota_changed memanggil<br/>pg_notify quota_changed dengan event_id.<br/>Notifikasi ditahan sampai commit.
    API->>DB: INSERT orders (PENDING, expires_at = now + 15 menit)
    opt ada Idempotency-Key
        API->>DB: INSERT idempotency_keys
    end
    API->>DB: COMMIT
    DB-->>L: NOTIFY quota_changed (event_id), terkirim saat commit
    API-->>Buyer: 201 pesanan PENDING

    Note over L: Jendela trailing 400 ms. Notifikasi berikutnya<br/>untuk event yang sama ikut jendela yang sama.
    L->>DB: baca counter event (koneksi LISTEN sendiri, bukan pool)
    L-->>SSE: event quota (publik: remaining, organizer: quota, sold, reserved)
    L-->>SSE: event orders (hanya stream organizer)
```

## Catatan

- Urutan lock: Idempotency-Key, lalu advisory lock pembeli dan event, lalu baris `ticket_types` paling akhir, karena lock barisnya dipegang sampai commit.
- Kalau transaksi dibatalkan di langkah mana pun, tidak ada notifikasi yang terkirim dan Idempotency-Key tidak tersimpan, jadi retry diproses ulang.
- Constraint `ticket_types_capacity` tidak dilewati alur ini karena atomic update sudah menolak lebih dulu. Constraint itu hanya pengaman terakhir.
