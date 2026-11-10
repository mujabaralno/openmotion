# Klien ACP

Klien ini menghubungkan aplikasi ke satu agen melalui ACP v1 di atas stdio. Proses agen tetap dijalankan dan dilacak oleh registry M1-1, tetapi registry sekarang memakai `stdio: "pipe"` agar aplikasi dapat berbicara ACP.

## Komponen

| File | Fungsi |
|------|--------|
| `src/server/acp/jsonrpc.ts` | JSON-RPC newline-delimited, request/response, notification, timeout, deteksi proses berhenti |
| `src/server/acp/client.ts` | Sesi ACP: initialize, session/new, prompt, update, izin, cleanup |
| `src/server/acp/types.ts` | Tipe update, izin, dan hasil prompt |
| `src/server/agents/registry.ts` | Menjalankan proses, `stdio: "pipe"`, `getAgentProcess` |
| `tests/acp-client.test.mts` | Tes integrasi melalui mock M1-2 |

## Penggunaan

```ts
import { runAcpPrompt } from "@/server/acp/client";

const result = await runAcpPrompt({
  sessionId: "step-script-episode-1",
  agentId: "command-code",
  episodeSlug: "episode-1",
  workspaceRoot,
  prompt: "Tulis naskah episode...",
  onUpdate: (update) => {
    // M1-4 dapat meneruskan ini ke SSE.
  },
  onPermissionRequest: async (request) => {
    // M1-5 dapat menunggu keputusan pengguna.
    return { outcome: "cancelled" };
  },
});
```

`runAcpPrompt` selalu menutup sesi dan menghentikan proses di blok `finally`.

Untuk kontrol lebih lanjut:

```ts
const session = new AcpSession(options);
await session.start();
const result = await session.prompt("Halo");
await session.close();
```

## Alur

1. Registry menjalankan agen dengan `stdio: "pipe"` dan folder episode yang sudah divalidasi.
2. `initialize` dikirim dengan `protocolVersion: 1`. Versi lain ditolak dengan pesan jelas.
3. `session/new` dikirim dengan `cwd` episode dan `mcpServers: []`.
4. `session/prompt` dikirim dengan content block `text`.
5. `session/update` diteruskan melalui `onUpdate` dan dikumpulkan pada hasil akhir.
6. `session/request_permission` diteruskan ke `onPermissionRequest`.
7. Respons `session/prompt` menyelesaikan turn dengan `stopReason`.
8. Sesi ditutup; registry menghentikan process group.

Identitas sesi aplikasi (`appSessionId`) adalah `sessionId` registry. Identitas ACP (`acpSessionId`) berasal dari `session/new`; keduanya dikembalikan pada hasil prompt.

## Update dan isolasi sesi

- Setiap update hanya diterima jika `params.sessionId` sama dengan `acpSessionId` sesi tersebut.
- Satu proses agen melayani satu sesi; sesi berbeda memakai proses dan koneksi terpisah.
- Update yang datang untuk sesi lain diabaikan dan dicatat di log.

## Izin

Jika `onPermissionRequest` tidak diberikan, permintaan izin **tidak pernah disetujui otomatis**. Klien memilih opsi `reject` jika tersedia, atau mengembalikan outcome `cancelled`, lalu mencatatnya di log.

Jika handler diberikan, hasilnya divalidasi:

- `selected` hanya diterima jika `optionId` ada pada daftar opsi agen.
- Handler yang gagal atau mengembalikan opsi tidak dikenal menghasilkan `cancelled`.

## Timeout dan kegagalan

Default: initialize/session 15 detik, prompt 60 detik. Semua dapat diatur melalui `initializeTimeoutMs` dan `promptTimeoutMs`.

- Prompt yang timeout mengirim `session/cancel`, lalu menutup sesi.
- Proses yang berhenti menolak semua request yang menunggu dengan error `connection-lost`.
- JSON tidak valid dari agen menghasilkan error yang jelas.
- Prompt tidak pernah dikirim ulang otomatis setelah proses terputus.
- Error autentikasi (`auth_required` atau pesan login) menambahkan petunjuk untuk menjalankan login agen di terminal.

Kode error `AcpClientError`:

| Kode | Arti |
|------|------|
| `start-failed` | Proses/sesi gagal dimulai |
| `unsupported-version` | Versi ACP agen bukan v1 |
| `invalid-response` | Response/update tidak valid |
| `timeout` | Agen tidak merespons dalam batas waktu |
| `connection-lost` | Proses berhenti atau koneksi ditutup |
| `agent-error` | Agen mengembalikan JSON-RPC error |
| `not-started` | Prompt dikirim sebelum sesi aktif |
| `closed` | Sesi sudah ditutup |

## Pengujian otomatis

```bash
node --test tests/acp-client.test.mts
# atau seluruh suite
npm test
```

Tes memakai mock M1-2 dan folder sementara, tanpa akun atau kuota:

- Inisialisasi, session baru, prompt, update bertahap.
- Dua sesi tidak mencampur update/proses.
- Izin default ditolak, tidak ada penulisan file.
- Handler izin dapat menyetujui penulisan file.
- Timeout dan proses terputus dibersihkan.
- Response tidak valid gagal dengan jelas.
- Tidak ada proses yang tertinggal.

## Uji manual agen asli

**Tanggal:** 10 November 2026  
**Agen:** Command Code (`command-code acp`)  
**Folder kerja:** folder episode sementara `acp-real-*`, dihapus setelah uji  
**Prompt:** meminta satu kalimat balasan tanpa mengubah file atau menjalankan perintah  
**Hasil:** `stopReason: end_turn`; teks `"Halo dari uji ACP Workflow Studio."`; 13 update termasuk `available_commands_update`, `agent_thought_chunk`, dan `usage_update`. Tidak ada kredensial atau token yang dicatat.

Uji ini melewati klien ACP aplikasi, bukan hanya skrip handshake S1.

## Batasan

- Panel chat/SSE, antrean izin, UI, dan pembatalan menyeluruh belum termasuk; masing-masing M1-4 sampai M1-6.
- Transkrip permanen belum disimpan; M1-7.
- Klien saat ini menangani satu agen per sesi.
- Fallback CLI dan multi-agen mengikuti M5.
