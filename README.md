# OpenMotion

Dashboard produksi Shorts lokal: topik → paket episode parallax → narasi bertag → voice-over ElevenLabs → rakit scene → render dan review. Setiap hasil ditinjau dan disetujui pengguna sebelum tahap berikutnya dibuka.

## Menjalankan

Prasyarat: Node.js 22+, npm, dan satu coding agent dengan ACP yang sudah terpasang serta login. CommandCode adalah acuan integrasi pertama dari `docs/agents.md`.

```bash
npm install
npm install --prefix remotion
cp .env.local.example .env.local
npm run dev
```

Isi `WORKSPACE_DIR` dengan path absolut dan `ELEVENLABS_API_KEY` di `.env.local`, lalu restart server. Buka http://127.0.0.1:3000. Aplikasi hanya untuk komputer sendiri. `APP_PORT` harus sesuai port Next.js jika menggunakan port selain 3000.

Di **Pengaturan**:

- Periksa lokasi workspace; lokasinya diatur lewat environment.
- Pada tab Agen, tambahkan Claude Code, Codex, OpenCode, atau Command Code dan pilih agen utama. Konfigurasi `agents.json` tetap tersedia pada bagian lanjutan.
- Isi Voice ID dan model ElevenLabs yang mendukung audio tags. Default model adalah `eleven_v3`; model bisa diganti sesuai akses akun.
- Timestamp aktif secara default. Jika model tidak mendukung endpoint tersebut, nonaktifkan; caption pengganti menggunakan timing perkiraan berdasarkan audio.
- Sesuaikan nama seri, bahasa, template, dan panduan visual bila diperlukan.

## Produksi episode

1. **Buat episode:** cukup isi topik; judul boleh dikosongkan untuk mengikuti topik.
2. **Paket episode:** pilih agen, model, dan effort pada panel Agen produksi, lalu jalankan. Tanggapi kartu izin, baca dokumen lengkap dan master narasi. Edit bila perlu, lalu setujui.
3. **Tag emosi:** agen menyiapkan narasi bertag tanpa mengganti kata. Tinjau dan setujui.
4. **Voice-over:** aplikasi mengirim narasi bertag ke ElevenLabs. Penggunaan karakter ditampilkan sebagai perkiraan, bukan nilai kredit pasti. Dengarkan audio lalu setujui. Generate ulang perlu konfirmasi penimpaan.
5. **Rakit scene:** agen menggambar visual Remotion berdasarkan paket episode dan audio sebenarnya. Aplikasi menghasilkan preview video 540×960 untuk review. Setujui atau beri catatan revisi.
6. **Render:** hasil final 1080×1920, 30 FPS, H.264. Progres tersimpan. Putar, unduh, dan setujui video atau minta revisi yang membuka kembali tahap scene.

Setiap tahap dapat dibatalkan. Refresh browser menyambung ulang ke pekerjaan yang masih berjalan. Server restart menandai pekerjaan yang terputus sebagai gagal; prompt dan panggilan berbayar tidak diulang otomatis. Isi file tahap berikutnya dibaca dari workspace, bukan disalin kembali dari chat.

Daftar model/effort dibaca dari agen lewat ACP tanpa mengirim prompt. Effort mengikuti model: tidak semua model menyediakan low/medium/high. Pilihan diterapkan sebelum prompt dan disimpan per tahap saat dijalankan. Mengganti model memuat ulang pilihan effort. Pilihan yang tidak didukung ditolak, sehingga tidak diam-diam kembali ke default. Tahap Tag emosi dan Rakit scene juga memiliki pilihan tersendiri; pilihan ini terpisah dari model ElevenLabs.

Preview menggunakan renderer lokal yang sama dengan hasil final. Render pertama dapat membutuhkan unduhan browser headless Remotion. Pastikan komputer mempunyai akses unduhan dan ruang penyimpanan. Preview membutuhkan waktu render, bukan Player interaktif.

## Workspace

```text
workspace/
  agents/shorts-episode-parallax/   # skill dan referensi
  agents.json                     # perintah ACP
  prompts/                        # script.md, tags.md, scenes.md
  guide/style-parallax.md
  episodes/<slug>/
    episode.json
    AGENTS.md
    01-episode.md                 # paket produksi lengkap
    01-naskah.md                  # master narasi bersih
    02-naskah-tagged.md
    03-voiceover.mp3
    03-voiceover.timestamps.json
    03-audio.json                 # durasi audio terukur
    04-scenes.json                # manifest preview dan sidik input
    remotion/
      Episode.tsx                 # visual yang dibuat agen
      index.tsx                   # wrapper milik aplikasi
      props.json
      public/audio.mp3
    logs/<kind>.jsonl
    out/preview.mp4
    out/<slug>.mp4
```

Status dan metadata ada di `data/app.db`; pilihan studio ada di `data/settings.json`. Skill dan template bawaan di repo `agents/` disalin ke workspace jika belum ada. Penyesuaian pengguna dipertahankan.

## Batas dan keamanan

- Seluruh API memakai guard Host/Origin. Tindakan membutuhkan token per-start.
- Izin awal manual. Auto-izin harus dinyalakan pengguna untuk pelaksanaan langkah aktif, dan setiap keputusan dicatat. Pilihan persetujuan dibatasi `allow_once`.
- Penjaga path membatasi file API. Coding agent tetap merupakan alat developer yang dapat menjalankan perintah sesuai izin dan pengaturan agen; instruksi folder kerja bukan sandbox sistem operasi.
- Key API tidak dikirim ke UI atau proses renderer. Nilai rahasia yang dikenal disaring sebelum pencatatan dan streaming.
- Pengubahan paket/narasi membatalkan persetujuan tahap turunannya. Artefak tahap berikutnya harus dibuat serta ditinjau ulang. Dokumen dan source visual merupakan working file selama revisi; audio/video lama baru diganti setelah hasil baru berhasil dibuat.
- Riset fakta, kualitas visual, dan hasil narasi tetap perlu review manusia. Tidak ada upload YouTube atau publikasi otomatis.

## Pengujian

```bash
npm run typecheck
npm run lint
npm test
npm run test:security
npm run test:pipeline
npm run test:dashboard
```

Tes pipeline dan dashboard memakai database serta workspace sementara. `test:pipeline` menjalankan agen ACP simulasi, respons ElevenLabs simulasi, probe MP3, dan render Remotion sungguhan hingga MP4 portrait dengan audio. Diperlukan dependensi `remotion/`, `ffmpeg`, dan `ffprobe` di PATH. Render pertama dapat mengunduh browser. Tes render berat dipisahkan dari `npm test`.

`test:dashboard` membangun aplikasi produksi dan memeriksa halaman, API, SSE, izin, editor, media range, serta persistensi setelah restart. `test:stream` menjalankan pemeriksaan integrasi yang sama. Akun agen/ElevenLabs asli dan mutu naskah/visual dari model tetap perlu diuji dengan konfigurasi pengguna.

Dokumen teknis tambahan ada di `docs/production-pipeline.md`, `docs/permissions.md`, dan `docs/agents.md`.
