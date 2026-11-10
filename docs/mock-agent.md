# Mock ACP Agent

Mock ini adalah agen ACP lokal untuk pengujian. Ia tidak memanggil model, tidak memakai akun, dan tidak memakai kuota layanan AI.

File: `tests/fixtures/mock-acp-agent.mjs`. Test client: `tests/helpers/acp-test-client.mts`.

## Cara menjalankan

Mock adalah proses Node biasa yang berbicara JSON-RPC ACP lewat stdio:

```bash
node tests/fixtures/mock-acp-agent.mjs --scenario stream --delay-ms 30
```

Melalui `agents.json` workspace pengujian:

```json
{
  "agents": [
    {
      "id": "mock",
      "name": "Mock ACP Agent",
      "command": "node",
      "args": [
        "/Users/goldgold/Documents/openmotion/tests/fixtures/mock-acp-agent.mjs",
        "--scenario",
        "permission",
        "--delay-ms",
        "30"
      ]
    }
  ]
}
```

Gunakan path absolut untuk skrip mock. `command` boleh `node` dari `PATH` atau path absolut ke executable Node.

## Argumen

| Argumen | Default | Fungsi |
|---------|---------|--------|
| `--scenario` | `stream` | `stream` atau `permission` |
| `--delay-ms` | `25` | Jeda antar potongan teks |
| `--spawn-child` | mati | Spawn proses turunan saat prompt dimulai |
| `--child-pid-file` | tidak ada | Tulis `{ parent, child }` PID ke file |
| `--file-name` | `mock-output.txt` | Nama file yang ditulis setelah izin |

Argumen atau skenario yang tidak valid menghasilkan pesan di stderr dan exit code `2`.

## Alur ACP yang didukung

- `initialize` → `protocolVersion: 1`.
- `session/new` dengan `cwd` absolut yang harus berupa folder.
- `session/prompt` dengan content block `text`.
- `session/update`:
  - `agent_message_chunk` untuk teks bertahap;
  - `tool_call` dan `tool_call_update` untuk skenario izin.
- `session/request_permission` dengan opsi `allow` dan `deny`.
- `session/cancel` untuk menghentikan prompt yang sedang berjalan.
- Respons `session/prompt` dengan `stopReason: "end_turn"` atau `"cancelled"`.

Teks streaming dipecah menjadi beberapa `agent_message_chunk` dengan jeda, sehingga tes dapat membuktikan respons sudah diterima sebelum turn selesai.

## Skenario

### `stream`

Mengirim beberapa potongan teks sampai selesai. Tidak menulis file.

### `permission`

1. Mengirim teks awal.
2. Mengirim `tool_call` untuk menulis `mock-output.txt`.
3. Mengirim `session/request_permission`.
4. Menunggu keputusan.

Hasil:

- **Disetujui** (`optionId: "allow"`): file ditulis dengan isi `approved:<sessionId>:<promptText>\n`, lalu teks sukses dikirim.
- **Ditolak** (`optionId: "deny"`): file tidak ditulis, tool call ditandai gagal, teks penolakan dikirim.
- **Belum ada keputusan**: agen tetap menunggu; file tetap tidak ada.
- **Dibatalkan**: tidak ada file dan tidak ada keluaran lanjutan.

### `--spawn-child`

Proses turunan Node dijalankan saat prompt dimulai. PID-nya dapat ditulis ke `--child-pid-file`. Saat sesi dibatalkan atau mock berhenti, child dihentikan. Integrasi aplikasi juga dapat menghentikannya lewat process group registry.

## Pengujian

```bash
npm test
```

Tes `tests/mock-agent.test.mts` memakai folder sementara untuk setiap skenario dan memeriksa:

- Teks streaming diterima dalam beberapa bagian.
- File tidak ada sebelum keputusan izin.
- Izin disetujui menulis file dengan isi yang benar.
- Izin ditolak tidak menulis file.
- Tanpa keputusan, prompt belum selesai dan file tidak ada.
- Pembatalan saat streaming menghentikan keluaran dan tidak menulis file.
- Pembatalan menghentikan proses turunan.
- Mock dan turunannya tidak tertinggal setelah tes.

Test client `AcpTestClient` dapat dipakai ulang untuk tes integrasi berikutnya:

```ts
import { AcpTestClient } from "./helpers/acp-test-client.mts";

const client = new AcpTestClient(
  process.execPath,
  ["tests/fixtures/mock-acp-agent.mjs", "--scenario", "stream"],
  temporaryCwd,
);
```

## Pemetaan ke issue berikutnya

| Issue | Pemakaian mock |
|-------|----------------|
| M1-3 | Klien ACP aplikasi berbicara dengan mock lewat proses lokal. |
| M1-4 | `agent_message_chunk` tampil bertahap melalui SSE dan panel chat. |
| M1-5 | Keputusan izin aplikasi menentukan apakah mock menulis file. |
| M1-6 | Pembatalan aplikasi menghentikan mock beserta proses turunannya. |

## Batasan

- Mock bukan model AI; isi respons selalu deterministik.
- Hanya `initialize`, `session/new`, `session/prompt`, `session/update`, `session/request_permission`, dan `session/cancel` yang didukung.
- `session/load`, autentikasi, MCP, dan terminal belum didukung.
- File hanya ditulis di `cwd` sesi dengan nama dari `--file-name`.
- Mock memakai stdio ACP; registry M1-1 yang memakai `stdio: "ignore"` belum bisa dipakai untuk percakapan penuh. Integrasi stdio penuh dilakukan di M1-3.
