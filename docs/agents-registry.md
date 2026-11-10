# Agent Registry

Registry agen adalah fondasi pengelolaan proses agen di server. Ia membaca `agents.json`, memvalidasi konfigurasi, menjalankan proses per sesi, dan membersihkan proses saat server berhenti. Protokol ACP, pengiriman prompt, streaming chat, dan UI izin belum termasuk.

## Format agents.json

File dibaca dari workspace melalui penjaga path M0-3. Symlink, file di luar workspace, dan format tidak valid ditolak.

```json
{
  "agents": [
    {
      "id": "command-code",
      "name": "Command Code",
      "command": "cmd",
      "args": ["acp"]
    },
    {
      "id": "opencode",
      "name": "OpenCode",
      "command": "opencode",
      "args": ["acp"]
    }
  ]
}
```

Aturan validasi:

- Root harus objek dan memiliki array `agents`.
- Setiap agen wajib punya `id`, `name`, `command`, dan `args`.
- `id` unik, maksimal 64 karakter, hanya huruf kecil, angka, titik, garis bawah, dan tanda hubung.
- `name` maksimal 120 karakter.
- `command` maksimal 1024 karakter.
- `args` harus array string; setiap argumen maksimal 4096 karakter.
- Karakter kontrol ditolak.
- Array `agents` boleh kosong, tetapi sesi dengan agen yang tidak terdaftar akan ditolak.

Konfigurasi dibaca saat sesi dimulai, bukan saat server menyala. Perubahan `agents.json` berlaku untuk sesi berikutnya tanpa restart server.

## Registry

Modul: `src/server/agents/registry.ts`.

```ts
import {
  getAgentSession,
  listAgentSessions,
  startAgentSession,
  stopAgentSession,
  stopAllAgentSessions,
} from "@/server/agents/registry";

const session = startAgentSession({
  sessionId: "step-script-123",
  agentId: "command-code",
  episodeSlug: "misteri-di-balik-pintu",
  workspaceRoot, // opsional; default dari WORKSPACE_DIR
});
```

Status sesi:

| Status | Arti |
|--------|------|
| `starting` | Proses sedang dimulai |
| `running` | Proses aktif |
| `exited` | Proses berhenti sendiri |
| `failed` | Gagal dimulai atau error proses |
| `stopped` | Dihentikan oleh registry |

Perilaku:

- Server menyala atau konfigurasi dibaca **tidak** menjalankan agen. Proses hanya dimulai lewat `startAgentSession`.
- Satu `sessionId` memiliki paling banyak satu proses. Permintaan berulang untuk sesi yang sama mengembalikan sesi yang sudah ada; proses tidak digandakan.
- Sesi yang sama tidak boleh dipakai untuk agen atau episode berbeda; registry mengembalikan error konflik.
- Folder kerja proses adalah `episodes/<slug>/`, divalidasi dengan penjaga path M0-3 dan harus berupa folder.
- Proses dijalankan tanpa shell, dengan `detached: true`, sehingga proses beserta turunannya berada dalam satu process group di macOS/Linux.
- Untuk klien ACP, registry dapat memakai `stdio: "pipe"` dan prosesnya diambil lewat `getAgentProcess(sessionId)`. Detailnya ada di [`acp-client.md`](acp-client.md).
- `stopAgentSession` mengirim `SIGTERM` ke process group; `{ force: true }` mengirim `SIGKILL`.
- `stopAllAgentSessions` hanya menghentikan proses yang tercatat di registry. Proses lain di komputer tidak disentuh.
- Registry disimpan di `globalThis` dengan kunci `__workflowStudioAgentRegistry`, sehingga pemuatan ulang modul saat pengembangan tidak menghilangkan pelacakan. Handler shutdown juga hanya dipasang sekali.

## Startup dan shutdown

`src/instrumentation.ts` memanggil `installAgentShutdownHandlers()` saat server start. Handler:

1. Menerima `SIGINT` atau `SIGTERM`.
2. Menghentikan seluruh proses agen beserta process group-nya dengan paksa.
3. Mengulang sinyal setelah listener registry dilepas agar Next.js dapat melanjutkan shutdown normal.
4. Memasang cleanup tambahan pada event `exit` sebagai jaring pengaman.

Penghentian paksa oleh sistem (misalnya `SIGKILL` ke server) tidak dapat dijamin karena aplikasi tidak mendapat kesempatan menjalankan cleanup.

## Pengujian

```bash
npm test
```

Tes registry ada di `tests/agent-registry.test.mts` dan memakai proses stub lokal, tanpa model atau kuota:

- Satu proses per sesi, permintaan berulang tidak menggandakan proses.
- Sesi berbeda memiliki proses berbeda.
- Folder kerja sesuai folder episode.
- Kegagalan spawn tercatat `failed` dan tidak aktif.
- Proses yang keluar sendiri tercatat `exited` beserta exit code.
- Penolakan sesi, agen, episode, dan konflik yang tidak sah.
- Registry tersimpan di `globalThis`.
- Cleanup hanya menghentikan proses milik registry dan aman dipanggil berulang.
- Server uji menerima `SIGTERM`; agen dan proses turunannya tidak tersisa.

Untuk memverifikasi manual di macOS setelah server berhenti:

```bash
ps -axo pid,ppid,command | grep stub-agent || true
```

Tidak boleh ada proses stub yang tersisa.

## Konfigurasi error

| Kode | Penyebab |
|------|----------|
| `workspace` | `WORKSPACE_DIR` kosong/relatif atau workspace belum siap |
| `unsafe-path` | `agents.json` symlink atau path ditolak penjaga |
| `missing-file` | `agents.json` tidak ditemukan |
| `unreadable` | File tidak bisa dibaca |
| `invalid-json` | JSON rusak |
| `invalid-shape` | Field wajib hilang atau tipe salah |
| `duplicate-id` | ID agen dipakai lebih dari sekali |

## Batasan

- Belum ada protokol ACP, prompt, streaming, izin, pembatalan dari UI, atau API sesi.
- Registry belum menyimpan metadata ke SQLite; ini masih di memori/globalThis sesuai M1-1.
- `resetAgentRegistryForTests` hanya untuk pengujian.
- Process group memakai semantik Unix; macOS adalah platform utama. Dukungan Windows perlu penanganan tersendiri.
- Konfigurasi `agents.json` adalah file lokal milik pengguna dan diperlakukan sebagai konfigurasi tepercaya, tetapi tetap divalidasi sebelum dipakai.

## File terkait

| File | Fungsi |
|------|--------|
| `src/server/agents/config.ts` | Pembaca dan validator `agents.json` |
| `src/server/agents/registry.ts` | Registry proses, globalThis, cleanup |
| `src/instrumentation.ts` | Memasang handler shutdown saat server start |
| `tests/agent-config.test.mts` | Tes konfigurasi |
| `tests/agent-registry.test.mts` | Tes registry dan shutdown |
| `tests/fixtures/stub-agent.mjs` | Agen stub untuk tes |
| `tests/fixtures/shutdown-runner.mjs` | Runner uji SIGTERM |
