# Arsitektur

```mermaid
flowchart LR
    Browser["Browser<br/>React + TanStack Query"]
    Provider["Penyedia pembayaran<br/>webhook bertanda tangan"]

    subgraph Compose["docker compose"]
        Nginx["Nginx :8080<br/>file statis + proxy /api"]

        subgraph API["API Hono :3000"]
            REST["Route REST<br/>auth, events, orders,<br/>payments, tickets, admin"]
            Sweeper["Sweeper<br/>tiap 30 detik"]
            Pool["Pool koneksi<br/>maks 10"]
            Listener["Koneksi LISTEN<br/>khusus, di luar pool"]
            Hub["Realtime hub<br/>jendela 400 ms, heartbeat 15 detik"]
        end

        subgraph PG["PostgreSQL :5432"]
            Tables[("orders, tickets,<br/>ticket_types, ...")]
            Trigger["Trigger<br/>ticket_types_quota_changed"]
            Channel["Channel<br/>quota_changed"]
        end
    end

    Browser -->|"halaman dan /api/..."| Nginx
    Nginx -->|"/api/ dengan prefix dibuang"| REST
    Provider -->|"POST /webhooks/payment"| REST

    REST --> Pool
    Sweeper --> Pool
    Pool --> Tables
    Tables -->|"UPDATE sold, reserved"| Trigger
    Trigger -->|"pg_notify saat commit"| Channel
    Channel -->|"NOTIFY"| Listener
    Listener -->|"baca counter"| Tables
    Listener --> Hub
    Hub ==>|"SSE: event quota dan orders"| Nginx
    Nginx ==>|"SSE, buffering off, timeout 1 jam"| Browser
```

## Alur singkat

1. Browser hanya berbicara dengan satu origin. Nginx menyajikan frontend dan meneruskan `/api/` ke API.
2. Semua perubahan kuota terjadi lewat transaksi di Postgres. Trigger memanggil `pg_notify` di transaksi yang sama, dan notifikasi baru terkirim setelah commit.
3. Setiap instance API punya satu koneksi LISTEN khusus. Notifikasi digabung per event dalam jendela 400 ms, counter dibaca lewat koneksi LISTEN itu sendiri (bukan pool, supaya tidak antre di belakang request pesanan), lalu dikirim ke semua stream SSE yang berlangganan event itu.
4. Stream organizer memakai tiket JWT berumur 60 detik di query string. Stream publik hanya mengirim `remaining`.
5. Kalau koneksi LISTEN putus, semua stream ditutup dan browser menyambung ulang. Setelah lebih dari 10 detik putus, browser beralih ke polling tiap 10 detik.
