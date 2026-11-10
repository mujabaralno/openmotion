# Database

Aplikasi memakai SQLite melalui `better-sqlite3`. Database dibuat otomatis di `data/app.db` saat server pertama kali berjalan, termasuk folder `data/` jika belum ada. Folder `data/` di-gitignore dan database hanya diakses dari server.

## Pengaturan koneksi

- `journal_mode = WAL` agar baca dan tulis tidak saling mengunci.
- `foreign_keys = ON` agar hubungan antartabel benar-benar ditegakkan.
- Database dibuka lewat `createDatabase()` di `src/server/db/index.ts`; aplikasi memakai singleton `getDb()`.
- Nama file dapat diganti dengan argumen `createDatabase(filePath)`, terutama untuk tes.

## Skema

| Tabel | Kolom |
|-------|-------|
| `episodes` | `id`, `slug` (unik), `title`, `topic`, `created_at`, `updated_at` |
| `steps` | `id`, `episode_id`, `kind`, `status`, `agent_id`, `session_ref`, `started_at`, `finished_at`, `error` |
| `permission_log` | `id`, `step_id`, `request_summary`, `decision`, `decided_at` |
| `render_jobs` | `id`, `episode_id`, `status`, `progress`, `output_path`, `started_at`, `finished_at`, `error` |

Hubungan:

- `steps.episode_id` → `episodes.id`, `ON DELETE CASCADE`.
- `permission_log.step_id` → `steps.id`, `ON DELETE CASCADE`.
- `render_jobs.episode_id` → `episodes.id`, `ON DELETE CASCADE`.

Nilai yang diizinkan untuk `steps.kind`: `script`, `tags`, `voiceover`, `scenes`, `render`, `thumbnail`, `publish`. Nilai `steps.status`: `idle`, `running`, `review`, `approved`, `failed`. Nilai-nilai ini diekspor sebagai `STEP_KINDS` dan `STEP_STATUSES`, dan trigger database menolak `INSERT`/`UPDATE` dengan nilai lain.

Isi percakapan agen tidak disimpan di database. Transkrip tetap berupa file `logs/<kind>.jsonl` di folder episode.

## Migrasi

Setiap perubahan skema dicatat di tabel `schema_migrations` (`version`, `name`, `applied_at`). Migrasi yang sudah tercatat tidak dijalankan lagi.

Saat ini ada satu migrasi:

| Versi | Nama | Isi |
|-------|------|-----|
| 1 | `initial-schema` | Empat tabel, indeks foreign key, dan trigger validasi langkah |

Migrasi berjalan di dalam transaksi. Jika satu migrasi gagal, perubahannya dibatalkan dan versinya tidak dicatat.

### Menambahkan migrasi berikutnya

1. Tambahkan objek baru ke array `MIGRATIONS` di `src/server/db/index.ts` dengan `version` berikutnya.
2. Jangan mengubah migrasi yang sudah pernah dirilis; buat migrasi baru.
3. Gunakan `IF NOT EXISTS` bila memungkinkan agar aman terhadap database yang sudah pernah menerima sebagian perubahan.
4. Jaga agar data lama tidak hilang. Untuk perubahan yang memerlukan rebuild tabel, salin data terlebih dahulu dan uji dengan database lama.
5. Tambahkan tes yang membuka database versi sebelumnya, menjalankan migrasi, lalu memeriksa data dan skema akhir.
6. Perbarui tabel migrasi di dokumen ini.

Migrasi yang sama aman dijalankan berulang: `createDatabase()` memeriksa versi yang sudah tercatat sebelum menjalankan migrasi.

## Pengujian

```bash
npm test
```

Tes database memakai folder sementara, bukan `data/app.db`, sehingga data pengguna tidak tersentuh. Cakupan:

- Database dan folder `data/` dibuat otomatis.
- Empat tabel, seluruh kolom, indeks, trigger, dan baris `schema_migrations`.
- Simpan lalu baca kembali setelah koneksi ditutup dan dibuka ulang.
- Slug duplikat ditolak.
- Foreign key ke episode atau langkah yang tidak ada ditolak.
- Cascade menghapus langkah, izin, dan render job saat episode dihapus.
- Kind/status langkah yang tidak sah ditolak pada insert dan update.
- Migrasi idempoten dan tidak menggandakan data.
- Database dari setup sebelumnya menerima migrasi tanpa kehilangan data.

## Melihat database

```bash
sqlite3 data/app.db ".tables"
sqlite3 data/app.db "SELECT * FROM schema_migrations;"
```

Jangan menyalin isi database ke issue, log, atau dokumen publik.

Migrasi 4 (`thumbnail-and-publish-steps`) memperbarui trigger kind/status dan menambahkan baris idle `thumbnail` serta `publish` ke episode yang sudah ada jika belum tersedia. ID langkah, persetujuan sebelumnya, permission_log, dan render_jobs dipertahankan.
