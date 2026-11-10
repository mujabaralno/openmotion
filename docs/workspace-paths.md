# Penjaga Path Workspace

`src/server/workspace/paths.ts` adalah satu-satunya fungsi yang boleh menentukan lokasi file workspace dari input pengguna. Fitur akses file berikutnya wajib memakai fungsi ini, bukan menyusun path sendiri.

## Daftar putih

| Area | Folder | File yang diizinkan |
|------|--------|---------------------|
| `root` | workspace | `agents.json` |
| `prompts` | `prompts/` | `script.md`, `tags.md`, `scenes.md` |
| `guide` | `guide/` | `style-parallax.md` |
| `episode` | `episodes/<slug>/` | `episode.json`, `01-naskah.md`, `02-naskah-tagged.md`, `03-voiceover.mp3`, `03-voiceover.timestamps.json` |
| `logs` | `episodes/<slug>/logs/` | `script.jsonl`, `tags.jsonl`, `voiceover.jsonl`, `scenes.jsonl`, `render.jsonl` |
| `out` | `episodes/<slug>/out/` | `<slug>.mp4` (nama diturunkan dari slug, bukan bebas) |

Area `episode`, `logs`, dan `out` wajib menyertakan `episodeSlug`. Area lain tidak memakai slug.

## Aturan

- `workspaceRoot` harus path absolut, sudah ada, dan berupa folder. Nilai ini ditentukan aplikasi, bukan input pengguna.
- `fileName` harus satu nama file tanpa folder, tanpa `/` atau `\`, tanpa `..`, bukan path absolut, dan tanpa karakter kontrol. Nama harus sama persis dengan daftar putih.
- Slug episode hanya boleh huruf kecil `a-z`, angka `0-9`, dan tanda hubung; panjang maksimal 64 karakter. Slug tidak boleh mengandung `/`, `\`, `..`, atau path absolut.
- Lokasi akhir harus tetap di dalam workspace dan, untuk area episode, di dalam `episodes/<slug>`.
- Pemeriksaan berlaku untuk file yang sudah ada maupun file baru.
- Semua komponen path yang sudah ada diperiksa dengan `lstat`. Symlink ditolak, baik pada file target maupun folder perantara, termasuk symlink ke lokasi lain di dalam workspace. Ini sengaja ketat agar slug tidak bisa dipakai berpindah ke episode lain.
- Jika target sudah ada, target harus file biasa. Jika komponen perantara sudah ada, komponen itu harus folder.
- Folder induk yang belum ada boleh, selama semua komponen yang sudah ada aman. Pembuat folder bertanggung jawab membuat folder tersebut.
- Penolakan terjadi sebelum file dibaca, dibuat, atau diubah. Fungsi penjaga hanya membaca metadata (`lstat`/`stat`), tidak membuka isi file.

## Penggunaan

```ts
import fs from "node:fs/promises";
import { resolveWorkspacePath } from "@/server/workspace/paths";

const resolved = resolveWorkspacePath({
  workspaceRoot,
  area: "episode",
  episodeSlug: episode.slug,
  fileName: "01-naskah.md",
});

if (!resolved.ok) {
  return { error: `Akses file ditolak: ${resolved.reason}` };
}

const content = await fs.readFile(resolved.path, "utf8");
```

Untuk membuat file baru:

1. Panggil penjaga untuk memastikan path aman.
2. Buat folder induk bila perlu.
3. Panggil penjaga sekali lagi sebelum menulis, lalu tulis ke `result.path`.

Pemeriksaan ulang setelah membuat folder penting agar folder yang baru dibuat tetap diverifikasi dan tidak ada symlink yang disisipkan di antara pemeriksaan dan penulisan.

Jangan menerima path lengkap dari browser. Terima area, nama file logis, dan slug; biarkan penjaga menentukan path sebenarnya.

## Pengujian

Jalankan:

```bash
npm test
```

Tes ada di `tests/workspace-paths.test.mts` dan mencakup:

- Semua file yang sah untuk setiap area, termasuk file baru dan folder induk yang belum ada.
- Workspace tidak sah, area tidak dikenal, nama kosong, `..`, path absolut, separator folder, dan karakter kontrol.
- Nama di luar daftar putih dan slug yang mencoba berpindah episode.
- Target yang bukan file biasa dan folder perantara yang ternyata file.
- Symlink pada file, folder episode, folder logs, folder prompts, dan folder `out` untuk file baru.
- Penolakan tidak mengubah atau membuat file di luar lokasi yang diizinkan.

## Batasan

- Hard link tidak dideteksi; model ancaman di sini adalah input path dan symlink.
- Masih ada jeda antara pemeriksaan dan operasi file (TOCTOU). Pemeriksaan ulang setelah pembuatan folder mengurangi risiko ini. Aplikasi ini lokal dan satu pengguna.
- File komposisi Remotion di `remotion/src/episodes/<slug>/` belum masuk daftar putih; pembatasan proses agen dibahas pada integrasi agen.
- Inisialisasi workspace dan folder `WORKSPACE_DIR` dijelaskan di [`docs/workspace.md`](workspace.md).
- API editor file dan layanan media akan memakai fungsi ini pada issue masing-masing.

## File terkait

| File | Fungsi |
|------|--------|
| `src/server/workspace/paths.ts` | Penjaga path dan daftar putih |
| `tests/workspace-paths.test.mts` | Unit test |
