# Episode

Fitur ini membuat dan membaca episode. Pengeditan dan penghapusan belum termasuk.

## Alur

1. Buka `/` (dialihkan ke `/episodes`).
2. Isi judul dan topik pada formulir **Episode baru**.
3. Setelah disimpan, pengguna diarahkan ke `/episodes/<slug>`.
4. Halaman daftar menampilkan semua episode beserta status tujuh langkah.
5. Halaman detail menampilkan judul, topik, slug, waktu dibuat, dan status tiap langkah.

## API

Semua rute memakai guard keamanan yang sudah ada. `POST` membutuhkan Origin aplikasi dan token; UI memakai cookie token dari `/api/security/session`.

| Metode | Rute | Fungsi |
|--------|------|--------|
| `GET` | `/api/episodes` | Daftar episode beserta langkah |
| `POST` | `/api/episodes` | Membuat episode |
| `GET` | `/api/episodes/:slug` | Detail satu episode |

Body `POST`:

```json
{
  "title": "Misteri di balik pintu",
  "topic": "Episode pembuka"
}
```

Batasan: judul wajib, maksimal 120 karakter; topik opsional, maksimal 500 karakter; karakter kontrol ditolak.

Respons sukses `POST` memakai status `201` dan mengembalikan `{ "episode": ... }`. Validasi gagal `400`, episode tidak ditemukan `404`, workspace belum siap `503`, kegagalan lain `500`.

## Slug dan folder

Slug dibuat di server dari judul:

- Huruf kecil, aksen dinormalisasi, spasi/simbol menjadi tanda hubung.
- Maksimal 60 karakter; jika kosong memakai `episode`.
- Jika slug sudah dipakai database atau folder, ditambahkan `-2`, `-3`, dan seterusnya.
- Judul yang sama tidak menimpa episode sebelumnya; keduanya mendapat slug dan folder berbeda.

Contoh: `Misteri di Balik Pintu` → `misteri-di-balik-pintu`, lalu `misteri-di-balik-pintu-2`.

## Data yang dibuat

Satu pembuatan episode menghasilkan:

- satu baris `episodes` di SQLite;
- folder `episodes/<slug>/`;
- file `episodes/<slug>/episode.json`;
- tepat tujuh baris `steps` dengan status `idle`: `script`, `tags`, `voiceover`, `scenes`, `render`, `thumbnail`, `publish`.

`episode.json` hanya menyimpan metadata dasar:

```json
{
  "slug": "misteri-di-balik-pintu",
  "title": "Misteri di Balik Pintu",
  "topic": "Episode pembuka",
  "createdAt": "2026-11-10T10:00:00.000Z",
  "updatedAt": "2026-11-10T10:00:00.000Z"
}
```

Status langkah **tidak** dibaca dari file ini. SQLite adalah sumber utama status; file hanya metadata agar folder episode bisa dikenali.

Jika penyimpanan database gagal setelah folder dan file dibuat, folder episode dihapus kembali dan transaksi database dibatalkan. Jadi episode yang gagal tidak muncul di daftar dan tidak meninggalkan data setengah jadi. Folder yatim dari proses yang terhenti sebelum database tersimpan tidak ditampilkan.

## Status

| Status | Label UI |
|--------|----------|
| `idle` | Belum mulai |
| `running` | Berjalan |
| `review` | Perlu review |
| `approved` | Disetujui |
| `failed` | Gagal |

Urutan langkah selalu: Naskah, Tag emosi, Voice-over, Scene, Render.

## UI

| Rute | Isi |
|------|-----|
| `/episodes` | Formulir episode baru dan daftar episode |
| `/episodes/<slug>` | Detail episode dan status tujuh langkah |

Tampilan memakai utility Tailwind CSS. Formulir menonaktifkan tombol selama penyimpanan untuk mencegah pengiriman ganda. Pesan validasi, kegagalan penyimpanan, daftar kosong, dan episode tidak ditemukan ditampilkan dalam bahasa Indonesia.

## Pengujian

```bash
npm test
```

`tests/episodes.test.mts` memakai database dan workspace sementara dan mencakup:

- Pembuatan episode, folder, `episode.json`, dan tepat tujuh langkah `idle`.
- Metadata file konsisten dengan baris database.
- Judul sama menghasilkan slug/folder berbeda.
- Benturan slug di database dan folder.
- Validasi judul/topik dan tidak ada penulisan saat input salah.
- Status langkah dibaca dari SQLite.
- Persistensi setelah database ditutup dan dibuka ulang.
- Rollback folder saat penyimpanan database gagal.
- Daftar kosong dan detail yang tidak ditemukan.

## Batasan

- Belum ada edit atau hapus episode.
- Belum ada perubahan status langkah, menjalankan agen, editor artefak, atau render.
- Idempotensi pengiriman ganda bergantung pada tombol yang dinonaktifkan saat proses berlangsung; belum ada idempotency key di API.

## File terkait

| File | Fungsi |
|------|--------|
| `src/server/episodes/slug.ts` | Pembuatan slug |
| `src/server/episodes/repository.ts` | Query daftar/detail dan insert episode |
| `src/server/episodes/service.ts` | Validasi, folder, metadata, rollback |
| `src/app/api/episodes/` | Route API |
| `src/app/episodes/` | Halaman daftar dan detail |
| `src/components/episode-create-form.tsx` | Formulir pembuatan |
| `src/components/episode-steps.tsx` | Daftar status langkah |
| `tests/episodes.test.mts` | Unit test |
