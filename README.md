# Workflow Studio

Aplikasi web lokal untuk mengelola produksi video: naskah, voice-over, scene, dan render. Aplikasi hanya berjalan di komputer sendiri (`127.0.0.1`) dan tidak untuk di-deploy ke internet.

## Prasyarat

- Node.js 22 atau lebih baru
- npm

## Menjalankan dari nol

```bash
git clone <url-repo> workflow-studio
cd workflow-studio
npm install
cp .env.local.example .env.local   # isi WORKSPACE_DIR dengan path absolut
npm run dev
```

Buka <http://127.0.0.1:3000>. Aplikasi sengaja terikat ke `127.0.0.1`, jadi tidak bisa dibuka dari perangkat lain di jaringan yang sama.

## Perintah

| Perintah | Fungsi |
|----------|--------|
| `npm run dev` | Menjalankan server pengembangan di `127.0.0.1:3000` |
| `npm run build` | Membuat build produksi |
| `npm run start` | Menjalankan hasil build di `127.0.0.1:3000` |
| `npm run lint` | Menjalankan ESLint |
| `npm run typecheck` | Memeriksa tipe TypeScript |
| `npm test` | Menjalankan seluruh tes unit |
| `npm run test:security` | Menjalankan tes integrasi keamanan API |
| `npm run test:stream` | Menjalankan tes integrasi streaming SSE |

## Database

Database SQLite dibuat otomatis saat server pertama kali berjalan, di `data/app.db`. Folder `data/` tidak di-commit. Tabel: `episodes`, `steps`, `permission_log`, dan `render_jobs`; perubahan skema dicatat di `schema_migrations`.

Nilai `steps.kind` dan `steps.status` dibatasi oleh trigger sesuai dokumen. Status aplikasi tersimpan permanen, sedangkan transkrip agen tetap berupa file `logs/<kind>.jsonl` di folder episode.

Untuk memastikan database, migrasi, dan hubungan antartabel bekerja:

```bash
npm test
```

Skema lengkap, aturan migrasi, dan cara menambah migrasi berikutnya ada di [`docs/database.md`](docs/database.md).

## Workspace

`WORKSPACE_DIR` menunjuk folder data produksi, terpisah dari kode aplikasi. Saat server start, aplikasi membuat struktur awal bila belum ada:

```text
<WORKSPACE_DIR>/
├── episodes/
├── prompts/
├── guide/
└── agents.json
```

Inisialisasi tidak menimpa file atau episode yang sudah ada. Jika konfigurasi kosong atau lokasi tidak bisa dipakai, log menampilkan penyebab dan cara memperbaikinya. Detail, contoh `agents.json`, dan daftar kesalahan ada di [`docs/workspace.md`](docs/workspace.md).

## Episode

Buka <http://127.0.0.1:3000> untuk masuk ke halaman episode. Pengguna dapat membuat episode dari judul dan topik, lalu membuka daftar dan detailnya.

Pembuatan episode menghasilkan baris database, folder `episodes/<slug>/`, `episode.json`, dan lima langkah produksi berstatus `idle`. Slug dibuat otomatis dan tetap unik meskipun judulnya sama. Status langkah dibaca dari SQLite.

API tersedia di `GET/POST /api/episodes` dan `GET /api/episodes/<slug>`. Detail alur, aturan slug, format data, dan batasan ada di [`docs/episodes.md`](docs/episodes.md).

## Agent registry

`agents.json` dibaca dari workspace dan divalidasi sebelum agen dijalankan. Registry menjalankan paling banyak satu proses per sesi pada folder episode yang sudah diverifikasi, menyimpan status di `globalThis`, dan membersihkan proses beserta turunannya saat server menerima `SIGINT`/`SIGTERM`.

Format konfigurasi, API registry, status proses, dan cara verifikasi cleanup ada di [`docs/agents-registry.md`](docs/agents-registry.md). Protokol ACP, chat, dan izin menyusul di issue berikutnya.

## ACP client

Klien ACP menghubungkan registry ke proses agen lewat stdio: `initialize`, `session/new` pada folder episode, `session/prompt`, update bertahap, dan permintaan izin. Secara default izin tidak disetujui otomatis; handler izin disiapkan untuk M1-5.

Detail API, timeout, penanganan error, dan hasil uji manual dengan CommandCode ada di [`docs/acp-client.md`](docs/acp-client.md).

## Streaming chat

Halaman detail episode memiliki panel chat agen dengan SSE. Teks, aktivitas tool, dan status sesi tampil bertahap; riwayat minimum disimpan di `logs/<kind>.jsonl`. Refresh dan reconnect memulihkan riwayat tanpa menjalankan agen baru.

Panel memakai komponen shadcn/ui dan pola AI Elements (`MessageScroller`, `Message`, `Bubble`, `Marker`, `Trace`). Detail rute, format event, reconnect, dan pengujian ada di [`docs/streaming.md`](docs/streaming.md).

## Styling

Proyek memakai Tailwind CSS v4 melalui plugin PostCSS resmi (`postcss.config.mjs`). `src/app/globals.css` mengimpor Tailwind dan tema shadcn/ui; seluruh tampilan memakai utility Tailwind. Komponen shadcn/ui dipakai untuk panel chat dan kontrolnya.

## Remotion

Contoh komposisi ada di folder `remotion/` dengan paket terpisah.

```bash
cd remotion
npm install
npm run dev        # buka Remotion Studio untuk pratinjau
npm run render     # render contoh ke out/example.mp4
```

## Struktur singkat

```
src/app/              halaman Next.js (App Router)
src/app/api/          route handler API
src/app/episodes/     halaman daftar dan detail episode
src/proxy.ts          guard keamanan untuk seluruh /api/*
src/server/db/        koneksi, skema, dan migrasi SQLite
src/server/episodes/  slug, repository, dan service episode
src/server/agents/    konfigurasi dan registry proses agen
src/server/acp/       klien ACP
src/server/agent-streams/  session manager, riwayat, dan SSE
src/server/security/  aturan Host/Origin dan token
src/server/workspace/ penjaga path, whitelist, dan inisialisasi workspace
src/components/       form, panel chat, dan komponen status episode
src/components/ui/    komponen shadcn/ui
tests/                tes unit
docs/                 catatan arsitektur dan keamanan
remotion/             proyek Remotion contoh
data/                 database dan token runtime (tidak di-commit)
```

## Keamanan API

Semua rute `/api/*` melewati guard yang sama:

- Hanya Host `127.0.0.1:<port>` dan `localhost:<port>` yang diterima.
- Origin harus asal aplikasi sendiri; permintaan lintas situs ditolak.
- `GET`/`HEAD` boleh tanpa Origin; `POST`/`PUT`/`PATCH`/`DELETE` wajib Origin dan token.
- Token acak dibuat ulang setiap server start, disimpan di `data/runtime/server-token`, dan dikirim ke UI lewat cookie `HttpOnly` + `SameSite=Strict`.
- UI memanggil `GET /api/security/session` saat dimuat untuk mendapatkan cookie tersebut.

Selengkapnya, termasuk cara menambah API baru dan cara menjalankan tes: [`docs/security.md`](docs/security.md).

Jika memakai port selain `3000`, set `APP_PORT` di `.env.local` agar Host/Origin yang sah ikut menyesuaikan.

## Penjaga path workspace

Akses file memakai `src/server/workspace/paths.ts`:

- `workspaceRoot` ditentukan aplikasi, bukan input pengguna.
- Hanya nama file yang ada di daftar putih yang diterima.
- Path absolut, `..`, separator folder, dan slug episode yang mencurigakan ditolak.
- Symlink pada file atau folder perantara ditolak, termasuk untuk file baru.

Daftar putih per area, aturan lengkap, dan contoh penggunaan ada di [`docs/workspace-paths.md`](docs/workspace-paths.md).
