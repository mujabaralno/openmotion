# Hasil pengujian

Pengujian dilakukan pada 10 November 2026 dengan Node.js 24.15.0, Next.js 16.4.6, dan Remotion 4.0.542. Database, workspace, konfigurasi agen, dan artefak runtime pengujian ditempatkan dalam direktori sementara. Data aplikasi pengguna tidak dipakai sebagai fixture.

| Pemeriksaan | Hasil |
|---|---|
| `npm run typecheck` | Lulus |
| `npm run lint` | Lulus tanpa warning |
| `npm test` | 99 lulus; 1 tes render dilewati pada suite reguler |
| `npm run test:pipeline` | 4 lulus, termasuk tes render yang dipisahkan dari suite reguler |
| `npm run test:security` | 23 pemeriksaan lulus |
| `npm run test:dashboard` | Build produksi dan 37 pemeriksaan HTTP/SSE lulus |

## Cakupan runtime

- Topik saja membuat episode dan lima langkah produksi.
- Agen ACP fixture mengalirkan teks dan meminta izin sebelum menulis artefak. Penolakan tidak menulis file; pembatalan mengakhiri pekerjaan.
- Paket episode menghasilkan master narasi; perubahan kata pada tahap tag ditolak. Revisi membuka ulang tahap berikutnya.
- Respons ElevenLabs disimulasikan. MP3 sungguhan dibaca durasinya, disiapkan untuk Remotion, dan dipakai untuk preview serta render final.
- MP4 final diperiksa dengan ffprobe: video 1080×1920, trek audio tersedia, durasi mencakup audio dan tiga detik penutup.
- Perubahan source setelah preview ditolak sebelum render final. Kegagalan provider tidak menimpa MP3 lama. Regenerasi audio memerlukan konfirmasi penimpaan.
- Halaman daftar/detail/pengaturan dirender oleh server produksi. API editor, prasyarat tahap, izin, pengaturan saat sibuk, media range/HEAD, serta respons error diperiksa lewat HTTP.
- Riwayat SSE dapat dibaca kembali setelah reconnect dan restart. Status episode bertahan setelah restart.
- Guard Host/Origin/token, token berganti setelah restart, migrasi database lama, dan penjaga path diperiksa oleh suite terkait.
- Preset agen ditambahkan tanpa mengganti agen yang sudah ada; preset duplikat ditolak. Pemilihan model dan effort diterapkan sebelum prompt serta bertahan setelah restart.
- Katalog model bertingkat dan model legacy didukung. Perpindahan model memuat ulang effort; effort yang tidak didukung serta perubahan yang diabaikan agen ditolak tanpa mengirim prompt.

Koneksi nyata Command Code juga diperiksa tanpa prompt: katalog mengembalikan 96 model. Model default saat pemeriksaan adalah `deepseek/deepseek-v4.1-flash` dengan effort `high`, dan pilihan yang diiklankan adalah `off`, `low`, `high`, `max`. Sesi sementara berhasil diubah ke `low`. Default terminal pengguna tidak diubah.

## Perbaikan dari hasil pengujian

- Memperbaiki tipe environment worker render agar typecheck berhasil.
- Memperbaiki pemuatan dokumen UI yang melanggar aturan effect React, serta karakter kutip di JSX pengaturan.
- Memperbarui tes migrasi untuk kolom catatan revisi sambil tetap memastikan data database lama dipertahankan.
- Memperbarui smoke streaming agar memakai kontrak pipeline produksi, bukan endpoint prompt bebas yang sudah diganti.
- Memisahkan hasil komposisi workspace dari typecheck/lint aplikasi. Migrasi ketiga menambahkan model dan effort tanpa menghapus data lama.

## Batas verifikasi

Prompt ke model agen asli dan ElevenLabs asli tidak dikirim. Pemeriksaan Command Code nyata terbatas pada pembukaan sesi, pembacaan katalog, dan perubahan effort. Pengujian lainnya memakai fixture terkontrol dan belum menilai kualitas riset, naskah, emosi suara, atau visual yang dibuat model asli.

Pemeriksaan interaksi visual browser tidak selesai: akses host browser tidak tersedia dan fallback aplikasi Safari mengalami timeout. Keberhasilan render HTML/API tidak dianggap sebagai bukti interaksi UI atau tampilan responsif sudah diperiksa secara visual.

## Menjalankan ulang

Jalankan perintah pada tabel dari root repo. `test:pipeline` membutuhkan dependensi dalam `remotion/`, serta `ffmpeg` dan `ffprobe` di PATH. Render pertama memerlukan jaringan untuk mengunduh browser Remotion. Build dashboard dapat memerlukan jaringan untuk font. `test:stream` merupakan alias pemeriksaan integrasi dashboard/SSE. Opsi `--keep` mempertahankan server sementara paling lama 15 menit untuk pemeriksaan browser; SIGINT/SIGTERM menutup dan membersihkannya lebih awal.
