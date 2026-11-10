> Pembaruan integrasi: endpoint `/run` kini menjalankan pipeline dari template server, memeriksa persetujuan langkah, dan menyimpan status di SQLite. Kontrol prompt bebas “Sesi uji” tidak menjadi UI produksi. Lihat `production-pipeline.md` untuk kontrak saat ini. Detail format SSE dan replay di bawah tetap menjadi acuan transport.

# Streaming Chat

Streaming menampilkan keluaran agen secara bertahap lewat SSE. Riwayat minimum disimpan sebagai JSONL agar refresh dan reconnect tidak memulai ulang agen.

## Alur

1. Klien menjalankan tahap produksi lewat `POST /api/episodes/:slug/steps/:kind/run`; server membangun prompt dari template dan memeriksa persetujuan tahap sebelumnya.
2. Server menjalankan `AcpSession` dan mencatat setiap event ke `logs/<kind>.jsonl` di folder episode.
3. Event disiarkan ke semua subscriber SSE dan disimpan di session manager.
4. Browser membuka `GET /api/episodes/:slug/steps/:kind/stream`.
5. SSE mengirim ulang riwayat attempt terbaru, lalu melanjutkan event live.
6. Setelah status selesai/gagal, stream ditutup dan browser menutup EventSource.

Membuka stream, refresh, atau reconnect **tidak** memulai proses agen dan tidak mengirim ulang prompt.

## API

| Metode | Rute | Fungsi |
|--------|------|--------|
| `GET` | `/api/agents` | Daftar `id`/`name` agen dari `agents.json` |
| `POST` | `/api/episodes/:slug/steps/:kind/run` | Jalankan tahap pipeline |
| `GET` | `/api/episodes/:slug/steps/:kind/stream` | SSE riwayat + update live |
| `POST` | `/api/permissions/:id` | Keputusan izin manual |
| `POST` | `/api/episodes/:slug/steps/:kind/permissions/auto` | Toggle auto-izin untuk sesi aktif |

Semua rute `/api/*` melewati guard keamanan. `POST` membutuhkan Origin dan token. SSE adalah `GET`; browser EventSource mengirim cookie yang diperlukan secara same-origin.

`run` memulai pekerjaan pipeline sesuai template dan data episode yang tersimpan. Riwayat transport tetap disimpan terpisah dari status langkah di SQLite.

## Format SSE

```text
retry: 1500

id: <attemptId>:<seq>
event: prompt
data: {"seq":1,"attemptId":"...","type":"prompt","text":"...","at":"..."}

id: <attemptId>:<seq>
event: update
data: {"seq":2,"attemptId":"...","type":"update","update":{"sessionUpdate":"agent_message_chunk",...},"at":"..."}

id: <attemptId>:<seq>
event: status
data: {"seq":7,"attemptId":"...","type":"status","status":"completed","agentId":"...","at":"..."}
```

Event:

- `prompt` — prompt produksi yang dibangun server.
- `update` — `session/update` ACP (teks, tool call, update tool).
- `status` — `idle`, `running`, `completed`, atau `failed`.
- `permission` — permintaan izin dan perubahan statusnya.
- `permission-mode` — auto-izin dinyalakan/dimatikan untuk sesi aktif.

Heartbeat `: ping` dikirim setiap 15 detik saat sesi masih berjalan.

## Reconnect dan refresh

- Setiap event memiliki `id` berformat `<attemptId>:<seq>`.
- EventSource mengirim `Last-Event-ID` saat reconnect.
- Server memutar event dengan `seq` lebih besar dari ID terakhir.
- Event terminal selalu dikirim ulang agar klien dapat menutup koneksi; UI melakukan deduplikasi berdasarkan ID event.
- Jika attempt berubah, replay dimulai dari awal attempt baru, bukan mencampur attempt lama.
- `retry: 1500` mempercepat reconnect.
- Browser yang terputus hanya menghapus subscriber. Proses agen tetap berjalan; event tetap ditulis ke log.
- Refresh halaman memuat riwayat attempt terbaru dari log. Jika sesi masih aktif, stream melanjutkan live; jika sudah selesai, terminal diputar ulang.

Jika server dimulai ulang saat log terakhir masih `running` dan tidak ada sesi aktif, stream mengirim status `failed` sintetis dengan penjelasan bahwa prompt tidak dikirim ulang.

## Riwayat JSONL

Lokasi: `episodes/<slug>/logs/<kind>.jsonl` di workspace, dibuat dengan permission `0600`.

- Satu file berisi beberapa attempt; setiap baris memiliki `attemptId`.
- Urutan `seq` unik per attempt.
- Attempt terbaru ditentukan dari urutan baris.
- Baris rusak diabaikan saat pembacaan.
- Event status, update, prompt, permission, dan permission-mode ikut tersimpan.
- Log tidak berisi token aplikasi atau kredensial dari registry.

## Panel chat

Komponen: `src/components/agent-chat-panel.tsx`.

Menggunakan pola dan komponen shadcn/ui:

- `MessageScroller`, `Message`, `Bubble`, `Marker` untuk thread dan status.
- `Trace`, `TraceLine`, `TraceIcon`, `TraceTitle` untuk aktivitas tool.
- `Item`, `Button`, `Badge`, `Switch` untuk kartu izin dan mode otomatis.

Perilaku:

- Teks agen tampil bertahap dari `agent_message_chunk`.
- Tool call dan perubahannya tampil di Trace beserta status.
- Status koneksi: memuat riwayat, tersambung, menyambung ulang, tidak ada sesi, selesai, gagal.
- Status sesi: berjalan, selesai, gagal, belum ada sesi.
- `MessageScroller` mengikuti live edge hanya saat pengguna berada di bawah; pengguna yang membaca pesan lama tidak dipaksa scroll.
- Deduplikasi berdasarkan `attemptId:seq`.
- Pindah langkah atau memulai attempt baru me-remount feed, sehingga state tidak tercampur.
- Panel ditutup saat pindah halaman/komponen unmount; agen tidak dihentikan.
- Kartu izin menampilkan tindakan dan tombol Setujui/Tolak; setelah sesi berakhir kartu menjadi tidak aktif.
- Switch auto-izin hanya berlaku untuk sesi/langkah yang sedang aktif.
- Agen dipilih pada panel produksi; tombol Jalankan agen memakai prompt dari template server.

Detail izin dan auto-izin ada di [`permissions.md`](permissions.md).

## Pengujian

```bash
npm test           # unit/integration manager, mock, ACP, dll.
npm run test:stream
npm run test:security
```

`npm test` mencakup:

- Streaming prompt, update bertahap, dan status selesai.
- Riwayat JSONL dan status terminal.
- Reconnect dengan `Last-Event-ID` tanpa duplikasi/gap.
- Refresh membaca riwayat tanpa memulai agen baru.
- Isolasi episode/langkah/attempt.
- Izin tidak disetujui otomatis.
- Validasi input dan sesi aktif ganda.

`npm run test:stream` menjalankan server Next sungguhan dan memeriksa:

- Build produksi, pembuatan episode, dan halaman daftar/detail/pengaturan.
- SSE prompt/update/status serta kartu izin sebelum penulisan artefak.
- Riwayat diputar ulang ketika tersambung kembali dan setelah server restart.
- Editor mengubah paket dan membatalkan persetujuan tahap setelahnya.
- Prasyarat tahap, file, dan episode tidak valid ditolak.
- Metadata media, byte range, dan range tidak valid.

Urutan event, deduplikasi, isolasi attempt, dan mode izin otomatis diuji oleh suite manager di `npm test`. Guard Origin/Host dan pergantian token diuji oleh `test:security`.

## Uji manual

1. Isi `WORKSPACE_DIR` dan `agents.json` dengan agen (mock atau agen asli).
2. Jalankan `npm run dev`, buka detail episode, pilih langkah.
3. Pilih agen pada panel produksi, lalu tekan Jalankan agen.
4. Amati teks/tool/status bertahap.
5. Refresh halaman: riwayat tetap ada dan agen tidak dijalankan ulang.
6. Putuskan jaringan sementara atau matikan koneksi browser: koneksi menunjukkan “Menyambung ulang”, lalu riwayat yang terlewat dipulihkan saat tersambung.

## Batasan

- Pembatalan terhubung melalui dashboard dan endpoint cancel pipeline.
- Redaksi rahasia dilakukan sebelum streaming dan penyimpanan transkrip.
- Status langkah SQLite dikelola layanan pipeline; status transport SSE tetap menunjukkan siklus sesi agen.
- Riwayat menampilkan attempt terbaru; attempt lama tetap tersimpan di JSONL tetapi belum memiliki pemilih attempt di UI.

Skrip smoke sekarang menggunakan kontrak pipeline produksi. Hasil verifikasi ada di `testing.md`.
