# Streaming Chat

Streaming menampilkan keluaran agen secara bertahap lewat SSE. Riwayat minimum disimpan sebagai JSONL agar refresh dan reconnect tidak memulai ulang agen.

## Alur

1. Klien memulai sesi langkah (kontrol uji sementara) lewat `POST /api/episodes/:slug/steps/:kind/run`.
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
| `POST` | `/api/episodes/:slug/steps/:kind/run` | Kontrol uji: mulai sesi agen untuk langkah |
| `GET` | `/api/episodes/:slug/steps/:kind/stream` | SSE riwayat + update live |
| `POST` | `/api/permissions/:id` | Keputusan izin manual |
| `POST` | `/api/episodes/:slug/steps/:kind/permissions/auto` | Toggle auto-izin untuk sesi aktif |

Semua rute `/api/*` melewati guard keamanan. `POST` membutuhkan Origin dan token. SSE adalah `GET`; browser EventSource mengirim cookie yang diperlukan secara same-origin.

`run` sengaja minimal: tidak mengubah status langkah di SQLite dan tidak menambahkan aturan pipeline. Kontrol ini dipakai untuk menguji streaming sampai UI/pipeline langkah berikutnya tersedia.

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

- `prompt` — prompt pengguna.
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
- Kontrol “Sesi uji” memilih agen dan mengirim prompt untuk menguji alur; ini bukan aturan pipeline.

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

- Pembuatan episode dan panel chat tampil di halaman detail.
- SSE prompt/update/status.
- Urutan dan attempt konsisten.
- Refresh memutar riwayat tanpa menambah log/sesi.
- Reconnect memulihkan event yang terlewat tanpa duplikasi.
- Kind/langkah atau episode tidak valid ditolak.
- Origin asing ditolak guard.

## Uji manual

1. Isi `WORKSPACE_DIR` dan `agents.json` dengan agen (mock atau agen asli).
2. Jalankan `npm run dev`, buka detail episode, pilih langkah.
3. Pada “Sesi uji”, pilih agen dan kirim prompt.
4. Amati teks/tool/status bertahap.
5. Refresh halaman: riwayat tetap ada dan agen tidak dijalankan ulang.
6. Putuskan jaringan sementara atau matikan koneksi browser: koneksi menunjukkan “Menyambung ulang”, lalu riwayat yang terlewat dipulihkan saat tersambung.

## Batasan

- Tombol pembatalan dan penghentian sesi menyeluruh mengikuti M1-6.
- Redaksi rahasia dan transkrip lengkap mengikuti M1-7.
- Status `steps` di SQLite belum diubah oleh kontrol streaming; pipeline/approval mengikuti issue berikutnya.
- Riwayat menampilkan attempt terbaru; attempt lama tetap tersimpan di JSONL tetapi belum memiliki pemilih attempt di UI.
