# Pipeline produksi OpenMotion

## Kontrak tahap

| Kunci | Masukan | Hasil yang diperiksa sebelum review |
|---|---|---|
| script | Topik, seri/bahasa, skill parallax dan referensi | `01-episode.md` lengkap dengan scene, Layer Map, Camera Plan, master voice-over; server mengekstrak `01-naskah.md` |
| tags | Master narasi dan konteks paket | `02-naskah-tagged.md`, seluruh kata narasi tetap sama |
| voiceover | Narasi bertag, Voice ID, model | MP3, metadata durasi audio sebenarnya, alignment bila tersedia |
| scenes | Paket lengkap, audio, timing, panduan | Default export `Episode.tsx`, preview berhasil dirender, manifest hash input |
| render | Komposisi yang disetujui dan input yang sama | MP4 H.264 1080×1920, 30 FPS |

Status: `idle → running → review → approved`, atau `failed`. Tahap baru membutuhkan semua tahap sebelumnya approved. Kegagalan dapat diulang. Revisi mengembalikan target dan tahap setelahnya ke idle. Revisi dari tahap render membuka kembali scenes. Edit manual membatalkan persetujuan downstream dan memerlukan review ulang.

## Konfigurasi

- Environment: WORKSPACE_DIR absolut; ELEVENLABS_API_KEY hanya server. Voice dan model dapat diatur di UI; environment menjadi nilai awal.
- `data/settings.json`: agen utama, Voice ID/model, seri, bahasa narasi/caption, pilihan timestamp. Tidak berisi key API.
- `workspace/agents.json`: perintah ACP yang sudah login. Gunakan mode manual yang sesuai kemampuan agen.
- `workspace/agents/shorts-episode-parallax`: salinan skill dan referensi dari repo. Template dan guide juga disalin jika belum ada. File pengguna tidak ditimpa.
- Format template saat ini: `{{topic}}`, `{{title}}`, `{{series}}`, `{{number}}`, `{{language}}`, `{{captionsLanguage}}`, `{{modelId}}`, `{{skill}}`, `{{guide}}`, `{{previous}}`, `{{package}}`, `{{narration}}`, `{{tagged}}`, `{{audioMetadata}}`, `{{composition}}`, `{{notes}}`. Variabel tidak dikenal menghasilkan error.

Master narasi di paket menggunakan heading persis `## Master Voice-over` dan blok kode `text`. Hanya isi blok menjadi `01-naskah.md`. Angka jumlah kata dan catatan estimasi harus berada di luar blok. Agen mengikuti berkas skill secara eksplisit, tidak bergantung pada pemanggilan `$skill` khusus editor tertentu.

## Eksekusi

`POST /api/episodes/:slug/steps/:kind/run` menerima pilihan `agentId`, `modelId`, `effort`, dan konfirmasi `overwrite` untuk audio. Prompt produksi dibangun server. Operasi yang berjalan tidak terikat koneksi browser. Pembaruan agen melalui SSE; status pipeline dan progres renderer melalui polling dashboard.

Model dan effort disimpan pada kolom `steps.model_id` dan `steps.effort` melalui migrasi ketiga. Sebelum prompt, sesi ACP memilih model terlebih dahulu lalu effort dari opsi model tersebut. `configOptions` diprioritaskan; agen lama dengan `models.availableModels` memakai `session/set_model`. Jika agen tidak mendukung effort, UI menjelaskannya dan tidak mengirim nilai effort. Nilai tidak tersedia atau perubahan yang tidak dikonfirmasi menggagalkan tahap sebelum prompt.

- `GET /api/episodes/:slug/pipeline`: status, metadata, ketersediaan artefak, pekerjaan aktif.
- `POST .../approve`, `.../revise` dengan `notes`, dan `.../cancel`: tindakan produksi.
- `POST .../steps/:kind/options` dengan `agentId` dan opsional `modelId`: sesi singkat untuk membaca katalog model/effort tanpa prompt; proses ditutup setelah pembacaan atau ketika request dibatalkan.
- `GET/PUT /api/episodes/:slug/files/:name`: tiga file teks yang diizinkan.
- `GET/HEAD /api/media/:slug/:name`: MP3, preview, final MP4; mendukung satu byte range dan unduhan.
- `GET/PUT /api/settings`: pengaturan, agen, template, guide. Pengubahan ditolak selama pekerjaan pipeline aktif.
- `PUT /api/settings` dengan `preset`: menambahkan preset agen dengan mempertahankan konfigurasi asli di server. Tidak menimpa agen yang sudah terdaftar.

Semua API melewati guard yang sama. Mutasi membutuhkan Origin dan token per-start. Tidak ada kunci API di payload UI atau environment worker render. Proses coding agent mengikuti izin ACP dan konfigurasi lokal pengguna; instruksi scope file bukan sandbox OS.

## Remotion

Setiap episode mempunyai `remotion/Episode.tsx` sebagai visual agen. Server menghasilkan `index.tsx`, `props.json`, serta `public/audio.mp3`. Wrapper menjamin audio satu track utuh, caption, ukuran portrait, dan tiga detik end card. Props visual: durationInFrames, fps, audioDuration, title, dan words. Hanya impor React/Remotion diperlukan.

Worker Node di `scripts/render-episode.mjs` memuat dependensi dari repo `remotion/`, membundle entry episode, dan menjalankan renderer. Probe MP3 memakai Mediabunny. Preview setengah ukuran memakai CRF 28; final memakai CRF 18. Satu renderer aktif; permintaan ketika sibuk ditolak dengan pesan yang dapat dicoba ulang. Identitas proses turunan terpisah agar pembatalan dan shutdown dapat menghentikan seluruh grup.

Video preview wajib selesai sebelum status scenes menjadi review. Hash source dan audio dicatat; render final menolak perubahan input setelah preview. Tidak ada preview live Player pada versi ini. Rendering pertama mungkin memerlukan download browser oleh Remotion.

## Izin, pembatalan, dan log

Izin manual ditangani antrean M1-5. Pilihan selalu `allow_once`; jika tidak ditawarkan, tindakan tidak disetujui sebagai izin permanen. Mode otomatis berlaku hanya pada attempt aktif dan tetap memberi keputusan per permintaan. Timeout prompt 30 menit dihentikan selama menunggu izin. Batal menolak izin pending, mengirim cancel, menutup proses agen, membatalkan fetch audio atau menghentikan renderer. Browser yang terputus tidak dianggap batal.

Nilai key/token/password yang dikenal disaring sebelum pencatatan dan streaming. Suffix pesan yang mungkin merupakan potongan kredensial ditahan sampai aman ditampilkan. Riwayat lama juga disaring ketika dibaca. Data rahasia yang tidak dikenal atau sudah disamarkan oleh sumber tetap memerlukan kehati-hatian pada konfigurasi agen.

Restart menandai langkah dan job render yang masih running sebagai failed. Pemulihan tidak menjalankan ulang model atau ElevenLabs otomatis. Audio dan video lama baru ditimpa setelah penggantinya berhasil dibuat. Dokumen serta source visual merupakan working file yang dapat ditulis agen selama revisi; tinjau kembali setelah proses selesai.

## Status verifikasi

Pengujian otomatis tersedia melalui `npm test`, `npm run test:security`, `npm run test:pipeline`, dan `npm run test:dashboard`. Semua pengujian runtime memakai database/workspace sementara. Pipeline diuji dari topik sampai MP4 1080×1920 dengan audio: agen dan respons ElevenLabs disimulasikan, sedangkan decoding audio, bundling, preview, dan render final dijalankan sungguhan. Pengubahan komposisi setelah preview ditolak; penolakan izin, pembatalan, revisi, serta audio lama ketika provider gagal ikut diperiksa.

Pemeriksaan akun asli dan kualitas keluaran model tetap dilakukan terpisah. Hasil rinci pengujian dicatat di `docs/testing.md`.
