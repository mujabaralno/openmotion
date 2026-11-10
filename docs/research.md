# Riset topik dan statistik channel

Halaman `/research` menambahkan diskusi sebelum membuat episode. Pilih agen, model, dan effort yang terdaftar, lalu kirim pertanyaan. Percakapan tersimpan di SQLite, jawaban muncul bertahap, dapat dihentikan, dan tetap tersedia setelah refresh/restart. Tombol Buat episode membuka form topik; aplikasi tidak menjalankan produksi atau membuat episode otomatis dari balasan agen.

## Sumber dan retrieval

RAG awal menggunakan SQLite FTS5 dengan ranking BM25, bukan embedding/vector search. Tidak membutuhkan penyedia embedding atau database tambahan. Pencarian mengikuti kata yang digunakan; kemiripan makna lintas bahasa belum dijamin.

Saat pesan dikirim, aplikasi membangun ulang indeks dari maksimal 500 episode terbaru yang naskahnya telah disetujui: judul/topik, master narasi, paket episode, dan paket publikasi yang juga sudah disetujui. Teks dipecah menjadi potongan dengan overlap; file dibaca melalui penjaga path workspace. Draft yang belum disetujui atau sumber yang telah dibuka untuk revisi dikeluarkan dari indeks berikutnya. Dokumen dibatasi panjangnya, sehingga hasil retrieval bukan bukti bahwa seluruh arsip telah diperiksa.

Statistik YouTube terakhir yang disinkronkan ikut masuk sebagai sumber. Retriever memilih potongan yang cocok dan menyertakan video dengan views tinggi sebagai konteks untuk pertanyaan umum. Maksimal delapan sumber dikirim ke agen, bersama riwayat percakapan terbatas. Snapshot sumber tersimpan per jawaban, berlabel S1, S2, dan seterusnya, dengan tautan episode/video dan excerpt yang dapat diperiksa. Rujukan ID yang tidak ada menyebabkan jawaban ditandai gagal. Akurasi kesimpulan model tetap perlu ditinjau; data historis tidak menjamin performa ide baru.

Agen riset bekerja di `WORKSPACE_DIR/research`, terpisah dari direktori episode. Mode read-only/plan dipilih jika tersedia, dan permintaan izin tool ditolak. Prompt memerintahkan diskusi teks saja dari konteks yang disediakan, bukan browsing atau operasi file. Hal ini bukan sandbox OS untuk executable agen yang dikonfigurasi pengguna; kemampuan bawaan agen tetap bergantung pada penyedianya. Secret YouTube/Google/ElevenLabs tidak diteruskan melalui environment proses riset atau konteks retrieval.

## Menghubungkan YouTube

Integrasi memakai YouTube Data API v3 dan YouTube Analytics API, bukan scraping YouTube Studio. Hanya satu channel tersambung pada versi ini; koneksi baru menggantikan snapshot channel sebelumnya. Tidak ada izin upload, posting, atau mengubah video.

1. Buat proyek Google Cloud dan aktifkan **YouTube Data API v3** serta **YouTube Analytics API**.
2. Konfigurasikan OAuth consent screen. Jika status aplikasi Testing, tambahkan akun pemilik channel ke test users.
3. Buat OAuth client bertipe **Web application**.
4. Daftarkan redirect URI persis seperti yang ditampilkan pada halaman Riset, misalnya `http://127.0.0.1:3000/integrations/youtube/callback`. Jika memakai `localhost`, daftarkan URI localhost juga. Port harus sesuai `APP_PORT`.
5. Isi `YOUTUBE_CLIENT_ID` dan `YOUTUBE_CLIENT_SECRET` di `.env.local`, lalu restart OpenMotion. Jangan commit atau mengirimkan Client Secret melalui chat.
6. Buka Riset topik, pilih **Hubungkan YouTube**, masuk dengan akun/channel yang benar, lalu izinkan kedua akses baca.
7. Pilih **Sinkronkan statistik**. Tidak ada penarikan data berulang otomatis atau biaya embedding tersembunyi.

Scope: `youtube.readonly` dan `yt-analytics.readonly`. Alur OAuth memakai state satu kali yang terikat cookie browser serta PKCE. Callback berada di luar `/api` agar redirect Google dapat diterima, tetapi memeriksa host lokal dan state. Token disimpan terenkripsi AES-GCM di database, dengan kunci lokal berizin 0600 pada `data/runtime/youtube-key`. Jika kunci hilang, koneksi harus dibuat ulang. Token/secret tidak dikembalikan lewat API status.

Token akses diperbarui menggunakan refresh token. Token aplikasi OAuth mode Testing dapat kedaluwarsa sesuai kebijakan Google; pencabutan izin atau perubahan konfigurasi bisa memerlukan Hubungkan ulang. Putuskan koneksi menghapus token dan snapshot statistik lokal, tetapi snapshot rujukan dalam percakapan lama tetap tersimpan; pencabutan akses penuh juga tersedia melalui pengaturan akun Google.

## Arti statistik

Sinkronisasi mengambil maksimal 50 video teratas menurut views dalam periode 90 hari sampai kemarin. Data Analytics dapat tertunda dan rentang data yang tersedia dapat lebih pendek daripada periode yang diminta. Angka ini bukan total views seumur hidup.

Konteks mencakup views, estimasi menit ditonton, rata-rata persentase video ditonton, likes, komentar, subscribers gained, tanggal publikasi, periode permintaan, dan waktu sinkronisasi. Tidak ada CTR atau klaim tren eksternal. Model diminta mempertimbangkan beberapa metrik dan menyebut analisis sebagai hipotesis, bukan sebab-akibat yang terbukti. Statistik video dari YouTube belum otomatis dipasangkan dengan slug episode lokal.

Kegagalan API atau laporan tidak valid tidak menimpa snapshot lama. UI tetap menunjukkan waktu sinkronisasi terakhir. Riset dapat dipakai tanpa YouTube, tetapi belum dapat mengidentifikasi video yang laku berdasarkan statistik channel.

## Pemeriksaan

Tes memakai database/workspace sementara, agen ACP palsu, dan respons OAuth/Analytics tiruan. Login Google nyata, izin channel, dan mutu rekomendasi agen asli memerlukan pengujian pengguna setelah kredensial dikonfigurasi.

Referensi: [laporan channel YouTube](https://developers.google.com/youtube/analytics/channel_reports), [reports.query](https://developers.google.com/youtube/analytics/reference/reports/query), [OAuth web server](https://developers.google.com/youtube/v3/guides/auth/server-side-web-apps), [SQLite FTS5](https://www.sqlite.org/fts5.html).
