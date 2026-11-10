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
cp .env.local.example .env.local   # opsional, isi bila perlu
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
| `npm test` | Menjalankan tes database |

## Database

Database SQLite dibuat otomatis saat server pertama kali berjalan, di `data/app.db`. Folder `data/` tidak di-commit. Tabel awal: `episodes`, `steps`, `permission_log`, dan `render_jobs`.

Untuk memastikan database bisa ditulis dan dibaca:

```bash
npm test
```

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
src/server/db/        koneksi dan skema SQLite
tests/                tes database
remotion/             proyek Remotion contoh
data/                 file database (tidak di-commit)
```

## Keamanan dasar

- Server hanya mendengarkan `127.0.0.1`.
- `.env.local`, folder `data/`, dan hasil render diabaikan oleh Git.
- Jangan menaruh kunci API atau isi database di dalam commit.
