# Verifikasi Dukungan ACP untuk Agen

**Tanggal verifikasi:** 10 November 2026  
**Lingkungan uji:** macOS 27.0.1 (Apple Silicon), Node.js v24.15.0, npm 11.12.1  
**Protokol:** Agent Client Protocol (ACP) v1, JSON-RPC 2.0 di atas stdio, pesan dipisah newline (`\n`).

## Ringkasan

Pengaturan aplikasi sekarang menyediakan tombol tambah Claude Code, Codex, OpenCode, dan Command Code. Adapter memakai versi yang dipin pada `src/lib/agent-presets.ts`. Daftar agen tetap dapat disesuaikan melalui `agents.json`.

Pada detail episode, panel Agen produksi membaca katalog model serta effort melalui `configOptions` ACP. Mengganti model memuat ulang effort yang didukungnya. Model dan effort diterapkan sebelum prompt, disimpan per tahap, dan tidak mengubah default CLI pengguna. Agen lama dapat memakai pemilih model legacy; effort hanya ditampilkan jika disediakan agen.

Rujukan konfigurasi sesi: [ACP Session Config Options](https://agentclientprotocol.com/protocol/v1/session-config-options). Model/effort berasal dari agen yang terhubung, bukan daftar model statis aplikasi.

| Agen | Dukungan ACP | Cara koneksi | Hasil uji | Kendala | Rekomendasi |
|------|--------------|--------------|-----------|---------|-------------|
| Claude Code | Tidak native, didukung lewat adapter resmi | `npx -y @agentclientprotocol/claude-agent-acp` (v0.102.0) | `initialize` berhasil, `session/new` berhasil | Butuh login Claude yang sudah ada; adapter Node, bukan bagian CLI Claude Code; mode default `auto` | Siap dipakai; kandidat kedua |
| Codex | Tidak native, didukung lewat adapter resmi | `npx -y @agentclientprotocol/codex-acp` (v2.6.0) | `initialize` berhasil, `session/new` berhasil | Butuh login Codex; adapter menjalankan Codex App Server; mode default `agent` | Siap dipakai; kandidat |
| OpenCode | Ya, native | `opencode acp` (v1.18.25) | `initialize` berhasil, `session/new` berhasil | Butuh `opencode auth login`; mode ACP hanya `build` dan `plan`; `/undo` dan `/redo` tidak didukung lewat ACP | Siap dipakai; kandidat kuat |
| CommandCode | Ya, native | `command-code acp` atau `cmd acp` (v1.88.5) | `initialize` berhasil, `session/new` berhasil | Butuh `cmd login`; satu proses melayani satu direktori proyek; mod `acp` harus aktif | **Rekomendasi integrasi pertama** |

Semua uji di atas adalah uji koneksi, bukan uji model. `session/prompt` sengaja belum dipanggil agar tidak memakai kuota/kredit. Artinya: transport, negosiasi kemampuan, autentikasi, dan pembuatan sesi sudah terbukti; balasan model dan permintaan izin perintah masih harus diuji di M1.

## Rincian hasil

### Claude Code

- **Perintah:** `npx -y @agentclientprotocol/claude-agent-acp`
- **Versi yang diuji:** adapter `@agentclientprotocol/claude-agent-acp` 0.102.0; Claude Code CLI 2.1.278.
- **Login:** `claude auth status` melaporkan `loggedIn: true` dengan metode `oauth_token`.
- **Hasil `initialize`:** `protocolVersion: 1`, `agentInfo.name: "@agentclientprotocol/claude-agent-acp"`, `loadSession: true`.
- **Kemampuan sesi:** `list`, `resume`, `close`, `delete`, `fork`, `additionalDirectories`, `systemPrompt` (termasuk mode `override`).
- **Prompt:** mendukung `image` dan `embeddedContext`; audio tidak.
- **Auth:** `authMethods` kosong karena sesi memakai login Claude yang sudah ada.
- **Hasil `session/new`:** berhasil mengembalikan `sessionId` dengan `cwd` repo ini.
- **Catatan penting:** mode sesi default adalah `auto` ("Claude handles permission decisions"). Untuk aplikasi yang mewajibkan izin per perintah, pilih mode `default` secara eksplisit.
- **Sumber:** [Repositori adapter](https://github.com/agentclientprotocol/claude-agent-acp), [halaman ACP Zed](https://zed.dev/acp/agent/claude-agent), [spesifikasi ACP](https://agentclientprotocol.com/protocol/v1/initialization).

### Codex

- **Perintah:** `npx -y @agentclientprotocol/codex-acp`
- **Versi yang diuji:** adapter `@agentclientprotocol/codex-acp` 2.6.0; Codex CLI 0.163.0.
- **Login:** `codex login status` melaporkan `Logged in using ChatGPT`.
- **Hasil `initialize`:** `protocolVersion: 1`, `agentInfo.name: "@agentclientprotocol/codex-acp"`, `loadSession: true`.
- **Kemampuan sesi:** `list`, `resume`, `close`, `delete`, `fork`, `title`, `additionalDirectories`, `systemPrompt`, `subagents`.
- **Prompt:** mendukung `image` dan `embeddedContext`; audio tidak.
- **Auth:** adapter menawarkan metode `api-key`, tetapi login ChatGPT yang sudah ada juga dipakai.
- **Hasil `session/new`:** berhasil mengembalikan `sessionId` dengan `cwd` repo ini.
- **Catatan penting:** mode default adalah `agent` ("Auto review"). Untuk izin ketat, pilih `read-only` atau `workspace-write` secara eksplisit.
- **Sumber:** [Repositori adapter](https://github.com/agentclientprotocol/codex-acp), [halaman ACP Zed](https://zed.dev/acp/agent/codex-cli), [spesifikasi ACP](https://agentclientprotocol.com/protocol/v1/initialization).

### OpenCode

- **Perintah:** `opencode acp`
- **Versi yang diuji:** OpenCode 1.18.25.
- **Login:** `opencode auth list` menunjukkan 2 kredensial API terdaftar.
- **Hasil `initialize`:** `protocolVersion: 1`, `agentInfo.name: "OpenCode"`, `loadSession: true`.
- **Kemampuan sesi:** `list`, `resume`, `close`, `fork`.
- **Prompt:** mendukung `image` dan `embeddedContext`; audio tidak.
- **MCP:** mendukung transport `http` dan `sse`.
- **Auth:** menawarkan metode `opencode-login` (jalankan `opencode auth login` di terminal).
- **Hasil `session/new`:** berhasil mengembalikan `sessionId`; respons juga memuat opsi model dan mode.
- **Catatan penting:** mode ACP yang tersedia hanya `build` dan `plan`. Pengaturan izin mengikuti konfigurasi OpenCode, bukan mode sesi ACP, sehingga perilaku izin default harus diverifikasi di M1.
- **Sumber:** [Dokumentasi ACP OpenCode](https://opencode.ai/docs/acp/), [spesifikasi ACP](https://agentclientprotocol.com/protocol/v1/initialization).

### CommandCode

- **Perintah:** `command-code acp` (alias `cmd acp`)
- **Versi yang diuji:** Command Code 1.88.5.
- **Login:** `command-code status` melaporkan autentikasi berhasil.
- **Hasil `initialize`:** `protocolVersion: 1`, `agentInfo.name: "Command Code"`, `loadSession: true`.
- **Kemampuan sesi:** `list`, `resume`, `close`.
- **Prompt:** mendukung `image` dan `embeddedContext`; audio tidak.
- **MCP:** mendukung transport `http`; `sse` tidak.
- **Auth:** menawarkan metode `command-code-cli` (jalankan `cmd login` di terminal).
- **Hasil `session/new`:** berhasil mengembalikan `sessionId` dengan `cwd` repo ini.
- **Catatan penting:** mode default adalah `default` ("Ask before running tools that change anything"), paling sesuai dengan kebutuhan izin per perintah. Mode lain: `auto-accept`, `plan`, `dont-ask`, `bypass`. Satu proses `cmd acp` melayani satu direktori proyek; ini cocok dengan rencana satu proses per sesi.
- **Sumber:** [Dokumentasi ACP Command Code](https://commandcode.ai/docs/acp), [spesifikasi ACP](https://agentclientprotocol.com/protocol/v1/initialization).

## Rekomendasi integrasi pertama

**Gunakan CommandCode lewat `cmd acp` untuk M1-3.**

Alasan:

1. **Native ACP**, tanpa adapter tambahan atau versi paket perantara yang harus dipin.
2. **Mode default `default`** sudah meminta izin sebelum menjalankan tool yang mengubah apa pun, selaras dengan aturan keamanan "izin default aktif" di `development.md` bagian 8.
3. **`initialize` dan `session/new` sudah terbukti** di lingkungan ini, termasuk reuse login CLI.
4. Dokumentasi ACP-nya menjelaskan streaming, tool call, kartu izin, plan, slash command, dan sesi — semuanya dibutuhkan M1.

Risiko yang perlu ditangani:

- Mod `acp` harus aktif (jangan ada di `mods.disabled`).
- Satu proses melayani satu direktori proyek. Registry M1 harus menutup proses lama sebelum membuka direktori episode lain, atau memakai satu proses per sesi/langkah.
- Mode `bypass` dan `dont-ask` tidak boleh dipakai sebagai default aplikasi.

**Alternatif berikutnya: OpenCode**, karena juga native dan sudah lolos uji yang sama. Claude Code dan Codex tetap layak, tetapi memerlukan adapter Node dan pengaturan mode izin yang lebih hati-hati.

## Prasyarat dan cara mengulangi

### Periksa login

```bash
claude auth status          # Claude Code
codex login status          # Codex
opencode auth list          # OpenCode
command-code status         # CommandCode
```

Jangan menyalin token, API key, atau isi file kredensial ke dokumen, log, atau issue.

### Jalankan uji handshake

Skrip uji ada di `scripts/acp-handshake.mjs`. Skrip akan:

1. menjalankan agen sebagai subprocess,
2. mengirim `initialize` dengan `protocolVersion: 1`,
3. lalu mengirim `session/new` dengan `cwd` direktori saat ini,
4. mencetak ringkasan respons dan keluar dengan kode `0` jika `sessionId` diterima.

```bash
# CommandCode (rekomendasi)
node scripts/acp-handshake.mjs command-code acp

# OpenCode
node scripts/acp-handshake.mjs opencode acp

# Claude Code lewat adapter
node scripts/acp-handshake.mjs npx -y @agentclientprotocol/claude-agent-acp

# Codex lewat adapter
node scripts/acp-handshake.mjs npx -y @agentclientprotocol/codex-acp

# Hanya initialize, tanpa session/new
node scripts/acp-handshake.mjs --initialize-only opencode acp
```

Keluaran yang diharapkan: `stage: "initialize"` dengan `protocolVersion: 1`, lalu `stage: "session/new"` dengan `ok: true` dan `sessionId`. Jika muncul `auth_required`, jalankan perintah login agen di terminal lalu ulangi.

Untuk adapter, pin versi saat integrasi agar hasil dapat direproduksi:

```bash
npx -y @agentclientprotocol/claude-agent-acp@0.102.0
npx -y @agentclientprotocol/codex-acp@2.6.0
```

## Implikasi untuk M1

- **Transport:** JSON-RPC 2.0, satu pesan JSON per baris, lewat stdin/stdout. Log agen hanya boleh dibaca dari stderr.
- **Satu proses per sesi:** spawn agen per langkah dengan `cwd` absolut ke folder episode. Jangan berbagi proses antar episode untuk CommandCode karena satu proses hanya melayani satu direktori.
- **Alur minimum:** `initialize` → `session/new` → simpan `sessionId` → `session/prompt` → tangani `session/update` dan `session/request_permission` → `session/cancel` bila dibatalkan.
- **Izin:** jangan mewarisi mode default agen. Set mode manual secara eksplisit:
  - CommandCode: `default`
  - Claude Code: `default`
  - Codex: `read-only` atau `workspace-write`
  - OpenCode: verifikasi konfigurasi izinnya lebih dulu; mode ACP hanya `build`/`plan`
- **Autentikasi:** pakai login CLI yang sudah ada. Tangani error `auth_required` dengan instruksi login ke pengguna; jangan menyimpan kredensial di database atau log.
- **Persistensi sesi:** keempat agen mengiklankan `loadSession`, `session/list`, dan `session/resume`, sehingga `sessionId` layak disimpan untuk menyambung ulang. Dukungan `close` ada di keempatnya; `delete`/`fork` tidak seragam.
- **Fallback CLI:** semua agen punya jalur ACP, jadi fallback CLI bukan jalur utama. Bila adapter gagal, CLI (`claude -p`, `codex exec`, `opencode run`, `cmd -p`) bisa dipakai, tetapi tidak memberikan permintaan izin per perintah seperti ACP; hanya ada flag tingkat kasar seperti sandbox atau mode izin. Ini harus ditandai sebagai keterbatasan di UI.

## Belum terverifikasi

- `session/prompt` dan balasan model untuk keempat agen (belum diuji agar tidak memakai kredit).
- Alur `session/request_permission` nyata dan bentuk kartu izin tiap agen.
- Pemulihan sesi lewat `session/load`/`session/resume` setelah proses dimatikan.
- Perilaku izin default OpenCode di luar mode `build`/`plan`.
- Dukungan Windows/Linux; pengujian ini hanya di macOS.

## Sumber resmi

- [ACP — Initialization](https://agentclientprotocol.com/protocol/v1/initialization)
- [ACP — Transports (stdio)](https://agentclientprotocol.com/protocol/v1/transports)
- [ACP — Session Setup](https://agentclientprotocol.com/protocol/v1/session-setup)
- [Claude Agent ACP adapter](https://github.com/agentclientprotocol/claude-agent-acp)
- [Claude Agent di Zed ACP](https://zed.dev/acp/agent/claude-agent)
- [Codex ACP adapter](https://github.com/agentclientprotocol/codex-acp)
- [Codex CLI di Zed ACP](https://zed.dev/acp/agent/codex-cli)
- [OpenCode — ACP Support](https://opencode.ai/docs/acp/)
- [Command Code — ACP Support](https://commandcode.ai/docs/acp)
- [Zed — External Agents](https://zed.dev/docs/ai/external-agents)
