# ERD Quotient

Sumber kebenaran skema adalah `api/migrations/0000_init.sql`. Diagram ini harus dicocokkan ulang setiap migrasi berubah.

```mermaid
erDiagram
    users ||--o{ events : "organizer_id"
    users ||--o{ orders : "buyer_id"
    users ||--o{ idempotency_keys : "buyer_id"
    events ||--|{ ticket_types : "event_id"
    events ||--o{ orders : "event_id"
    ticket_types ||--o{ orders : "ticket_type_id + event_id"
    orders ||--o{ tickets : "order_id"
    orders ||--o| idempotency_keys : "order_id"
    orders ||--o{ processed_events : "order_id"

    users {
        uuid id PK
        citext email UK
        text password_hash
        text name
        user_role role "buyer | organizer"
        timestamptz created_at
    }
    events {
        uuid id PK
        uuid organizer_id FK
        text title
        text description
        text venue
        timestamptz starts_at
        timestamptz created_at
    }
    ticket_types {
        uuid id PK
        uuid event_id FK
        ticket_kind kind "REGULAR | VIP"
        integer price "rupiah, >= 0"
        integer quota "CHECK >= 0"
        integer sold "CHECK >= 0, default 0"
        integer reserved "CHECK >= 0, default 0"
    }
    orders {
        uuid id PK
        uuid buyer_id FK
        uuid event_id FK
        uuid ticket_type_id FK
        smallint quantity "CHECK 1..4"
        order_status status "default PENDING"
        integer total_price
        timestamptz expires_at
        timestamptz created_at
        timestamptz paid_at
        timestamptz cancelled_at
        timestamptz expired_at
        timestamptz refund_required_at
    }
    tickets {
        uuid id PK
        uuid order_id FK
        smallint seq "1..4"
        text code UK
        timestamptz issued_at
    }
    idempotency_keys {
        uuid buyer_id PK
        text key PK
        text request_hash
        uuid order_id FK
        timestamptz created_at
    }
    processed_events {
        text event_id PK
        text event_type
        jsonb payload
        uuid order_id FK
        timestamptz received_at
    }
```

## Constraint yang tidak terlihat di diagram

| Tabel | Constraint | Fungsi |
|---|---|---|
| `ticket_types` | `ticket_types_capacity`: `sold + reserved <= quota` | Pengaman terakhir kuota. Selalu aktif, termasuk saat strategi `naive` |
| `ticket_types` | `UNIQUE (event_id, kind)` | Satu Reguler dan satu VIP per event |
| `ticket_types` | `UNIQUE (id, event_id)` | Target FK komposit dari `orders` |
| `ticket_types` | `price`, `quota`, `sold`, `reserved` `>= 0` | Pengembalian kuota ganda membuat `reserved` negatif dan langsung ditolak |
| `orders` | FK `(ticket_type_id, event_id)` ke `ticket_types (id, event_id)` | Pesanan tidak bisa menunjuk tipe tiket milik event lain |
| `orders` | `quantity BETWEEN 1 AND 4` | Batas per pesanan |
| `orders` | `status <> 'X' OR x_at IS NOT NULL` untuk PAID, CANCELLED, EXPIRED, REFUND_REQUIRED | Status selalu punya jejak waktu |
| `tickets` | `UNIQUE (order_id, seq)`, `seq BETWEEN 1 AND 4` | Satu pesanan tidak bisa menerbitkan tiket dua kali |
| `tickets` | `UNIQUE (code)` | Pengaman tabrakan kode. Keacakan berasal dari generator crypto |

## Index

| Index | Dipakai untuk |
|---|---|
| `orders (buyer_id, event_id) WHERE status IN ('PENDING','PAID')` | Hitung tiket aktif untuk batas 4 per pembeli per event |
| `orders (expires_at) WHERE status = 'PENDING'` | Sweeper kedaluwarsa |
| `orders (buyer_id, created_at DESC)` | Riwayat pesanan pembeli |

## Perpindahan kuota per transisi status

| Transisi | `reserved` | `sold` |
|---|---|---|
| Buat pesanan (PENDING) | +quantity | |
| PENDING ke PAID | -quantity | +quantity |
| PENDING ke CANCELLED atau EXPIRED | -quantity | |
| EXPIRED atau CANCELLED ke REFUND_REQUIRED | | |

Advisory lock batas 4 tiket tidak ada di skema:
`pg_advisory_xact_lock(hashtextextended(buyer_id::text || ':' || event_id::text, 0))`.
