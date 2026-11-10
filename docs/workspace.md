# Workspace

Workspace adalah folder data produksi, terpisah dari kode aplikasi. Lokasinya dibaca dari `WORKSPACE_DIR` di server saat aplikasi dinyalakan.

## Konfigurasi

Isi `WORKSPACE_DIR` di `.env.local` dengan **path absolut**:

```env
WORKSPACE_DIR=/Users/goldgold/Documents/workflow-studio-workspace
```

- Jangan memakai `~` atau path relatif.
- Folder boleh belum ada; aplikasi akan membuatnya bila izin folder induk memungkinkan.
- Folder harus bisa dibaca dan ditulis oleh user yang menjalankan aplikasi.
- Jika ingin workspace di dalam repo, gunakan folder khusus seperti `openmotion/workspace` dan tambahkan `workspace/` ke `.gitignore`.

Setelah mengubah `.env.local`, restart `npm run dev`.

## Struktur awal

```text
<WORKSPACE_DIR>/
├── episodes/
├── prompts/
├── guide/
└── agents.json
```

| Item | Kegunaan |
|------|----------|
| `episodes/` | Folder episode; dibuat pada M0-6. |
| `prompts/` | Template prompt; diisi pada M2-1. |
| `guide/` | Panduan gaya; diisi pada M2-1. |
| `agents.json` | Contoh konfigurasi agen. |

Yang **tidak** dibuat pada tahap ini: proyek Remotion, isi template prompt, panduan gaya, dan episode. Semua itu dikerjakan pada issue masing-masing.

## agents.json

File contoh yang dibuat:

```json
{
  "agents": [
    {
      "id": "command-code",
      "name": "Command Code",
      "command": "cmd",
      "args": ["acp"]
    }
  ]
}
```

Sesuaikan `id`, `name`, `command`, dan `args` dengan agen yang terpasang di komputer. Inisialisasi tidak menjalankan agen dan tidak menganggap perintah contoh sudah terverifikasi. Verifikasi koneksi agen dibahas di M1.

## Perilaku inisialisasi

1. Membaca dan memvalidasi `WORKSPACE_DIR`.
2. Membuat folder workspace bila belum ada.
3. Memastikan folder bisa dibaca dan ditulis.
4. Membuat `episodes/`, `prompts/`, dan `guide/` yang belum ada.
5. Membuat `agents.json` contoh bila belum ada.
6. Tidak menimpa file, folder, atau episode yang sudah ada.

Inisialisasi dijalankan saat server start melalui `src/instrumentation.ts`. Jika berhasil, log menampilkan:

```text
[workspace] siap di /path/ke/workspace
```

Jika gagal, aplikasi tetap menyala tetapi workspace **tidak dianggap siap**. Log menampilkan penyebab dan langkah perbaikan:

```text
[workspace] WORKSPACE_DIR belum diisi.
Perbaikan: Buka .env.local, isi WORKSPACE_DIR dengan path absolut folder kerja, lalu restart server.
```

## Kesalahan umum

| Kode | Penyebab | Perbaikan |
|------|----------|-----------|
| `missing-config` | `WORKSPACE_DIR` kosong | Isi di `.env.local`, lalu restart |
| `invalid-config` | Path relatif atau memakai `~` | Gunakan path absolut |
| `not-a-directory` | Lokasi workspace berupa file | Ganti dengan folder atau arahkan ke lokasi lain |
| `permission-denied` | Folder tidak bisa dibaca/ditulis | Perbaiki izin folder atau pilih folder lain |
| `collision` | `episodes`/`prompts`/`guide` berupa file, atau `agents.json` berupa folder | Pindahkan atau ganti nama item tersebut |
| `symlink` | Folder atau `agents.json` berupa symlink | Ganti dengan file/folder biasa |
| `unsafe-path` | Path ditolak penjaga M0-3 | Periksa symlink dan benturan tipe file |

## Keamanan

- Path harus absolut dan ditentukan aplikasi, bukan input browser.
- Folder `episodes/`, `prompts/`, dan `guide/` tidak boleh berupa symlink.
- `agents.json` tidak boleh berupa symlink dan divalidasi lewat penjaga path M0-3 sebelum dibuat.
- Inisialisasi tidak menulis di luar `WORKSPACE_DIR`.
- File yang sudah ada tidak ditimpa.

## Pengujian

```bash
npm test
```

Tes di `tests/workspace-init.test.mts` memakai folder sementara dan mencakup:

- Inisialisasi pertama dan pembuatan folder induk.
- Inisialisasi ulang tanpa menimpa agents.json, prompt, guide, atau episode.
- Workspace yang baru terisi sebagian.
- Konfigurasi kosong, path relatif, dan `~`.
- Lokasi yang berupa file, benturan folder/file, dan `agents.json` berupa folder.
- Symlink pada folder dan `agents.json`, termasuk memastikan tidak ada penulisan keluar workspace.
- Workspace yang tidak bisa ditulis.

## File terkait

| File | Fungsi |
|------|--------|
| `src/server/workspace/init.ts` | Inisialisasi workspace |
| `src/server/workspace/paths.ts` | Penjaga path dan whitelist file |
| `src/instrumentation.ts` | Menjalankan inisialisasi saat server start |
| `tests/workspace-init.test.mts` | Unit test |
