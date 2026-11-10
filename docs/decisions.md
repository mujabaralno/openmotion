# Keputusan produk dan struktur

- Nama dashboard: OpenMotion, mengikuti `design/openmotion.figcraft`.
- Satu workspace untuk artefak episode dan satu proyek Remotion utama di `remotion/`. Source tiap episode ada di `remotion/src/episodes/<slug>/`, dengan aset kerja di `remotion/public/episodes/<slug>/`. Agen scenes bekerja dari proyek utama yang memiliki dependensi bersama.
- Lima kunci langkah yang sudah tersimpan dipertahankan. `script` sekarang berarti paket episode parallax lengkap beserta master narasi.
- Preview awal berupa MP4 resolusi rendah melalui renderer lokal. Preview Player interaktif dapat ditambahkan kemudian.
- Integrasi menggunakan coding agent ACP milik pengguna. CommandCode menjadi acuan pertama berdasarkan hasil S1; agen lain dapat dikonfigurasi, tetapi perlu verifikasi operasional sendiri.
- Repo Tayang Studio hanya menjadi referensi pola. Perubahan ini tidak mengambil kode dari repo tersebut.
- Pengujian otomatis dijalankan setelah pengguna meminta verifikasi; hasil dan batas cakupannya dicatat di `docs/testing.md`. Prompt ke agen asli dan ElevenLabs asli serta pemeriksaan kualitas hasil model tetap dilakukan terpisah.
