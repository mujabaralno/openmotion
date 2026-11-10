# Izin Agen

Setiap permintaan izin ACP dari agen masuk ke antrean server. Agen tidak dapat menyetujui permintaannya sendiri: keputusan datang dari pengguna melalui API, atau dari mode otomatis yang dinyalakan pengguna untuk satu pelaksanaan langkah.

## Alur

1. `AcpSession` menerima `session/request_permission`.
2. Manager membuat `PermissionRecord` dengan identitas unik, episode, langkah, `attemptId`, dan `stepId`.
3. Event `permission` dikirim ke SSE dan ditulis ke `logs/<kind>.jsonl`.
4. Selama status `pending`, handler ACP belum dijawab; tindakan agen belum berjalan.
5. Pengguna memilih **Setujui** atau **Tolak** di kartu izin panel chat.
6. Server memvalidasi, mencatat ke `permission_log`, lalu meneruskan keputusan ke ACP.
7. Event `permission` terbaru disiarkan; kartu menampilkan status akhir.

## API

| Metode | Rute | Fungsi |
|--------|------|--------|
| `POST` | `/api/permissions/:id` | Keputusan manual: `{ "decision": "approve" \| "reject" }` |
| `POST` | `/api/episodes/:slug/steps/:kind/permissions/auto` | Nyalakan/matikan auto-izin: `{ "enabled": true \| false }` |

Keduanya melewati guard API dan membutuhkan Origin serta token untuk `POST`.

Respons keputusan berisi `{ permission }` dengan status terbaru. Penolakan:

- Permintaan tidak ditemukan/sudah diputuskan → `404`/`409`.
- Keputusan tidak valid → `400`.
- Gagal mencatat keputusan → `500`; tindakan **tidak** dijalankan.
- Sesi sudah berakhir → izin tidak dapat diputuskan.

## Status izin

| Status | Arti |
|--------|------|
| `pending` | Menunggu keputusan; tindakan belum berjalan |
| `approved` | Disetujui manual atau otomatis |
| `rejected` | Ditolak manual |
| `failed` | Keputusan gagal dicatat atau opsi ACP tidak valid |
| `expired` | Sesi berakhir sebelum keputusan |

`decisionSource` bernilai `manual` atau `auto`.

## `permission_log`

Persetujuan hanya memilih opsi `allow_once`; agen yang hanya menawarkan persetujuan permanen tidak disetujui lewat tombol satu tindakan.

Setiap keputusan yang dicatat menyimpan:

- `step_id` — langkah episode terkait;
- `request_summary` — judul tindakan, jenis tool, dan toolCallId;
- `decision` — `approved`, `rejected`, `approved_auto`, atau `rejected_auto`;
- `decided_at` — waktu keputusan.

Pencatatan dilakukan **sebelum** persetujuan diteruskan ke ACP. Jika insert gagal, keputusan diubah menjadi `failed` dan agen menerima penolakan/cancelled; file atau tindakan tidak dijalankan.

## Mode otomatis

- Default selalu manual.
- Mode hanya dapat dinyalakan untuk sesi/langkah yang sedang aktif.
- Mencakup permintaan **berikutnya** pada attempt tersebut. Permintaan yang sudah `pending` tetap manual.
- Tidak berlaku untuk langkah, episode, atau eksekusi baru; state baru selalu nonaktif.
- Hilang saat server restart.
- Persetujuan otomatis tetap dicatat sebagai `approved_auto`.
- Mode ini hanya mengatur handler izin aplikasi. Mode agen yang melewati ACP tidak diubah.

## UI

Panel chat menampilkan kartu izin memakai pola Confirmation dari AI Elements/shadcn (`Item`, `Button`, `Badge`):

- judul tindakan dan ringkasan tool;
- status `Menunggu keputusan`, `Disetujui`, `Disetujui otomatis`, `Ditolak`, `Kedaluwarsa`, atau `Gagal`;
- tombol **Setujui**/**Tolak** hanya aktif saat izin pending dan sesi masih berjalan;
- penghitung izin pending;
- switch **Mode izin otomatis** dengan indikator `Auto-izin aktif`;
- penjelasan bahwa izin pending tidak ikut otomatis.

Setelah refresh/reconnect, event `permission` diputar ulang dari log. Izin yang masih pending pada sesi aktif tampil kembali dan dapat diputuskan. Izin dari sesi yang sudah berakhir ditandai `expired` dan tombolnya tidak aktif.

## Pengujian

```bash
npm test
npm run test:stream
npm run test:security
```

Cakupan izin:

- Agen tidak menulis file sebelum keputusan.
- Persetujuan manual menjalankan tindakan satu kali dan mencatat `approved`.
- Penolakan manual tidak menulis file dan mencatat `rejected`.
- Auto-izin hanya setelah dinyalakan, mencatat `approved_auto`.
- Izin pending saat mode dinyalakan tetap manual.
- Mode tidak terbawa ke eksekusi baru atau langkah lain.
- Keputusan ganda, tidak valid, dan kegagalan log tidak menyetujui tindakan.
- Izin pending dari sesi berakhir menjadi `expired` dan tidak dapat disetujui setelah refresh.
- Persetujuan izin diuji lewat server Next dan SSE sungguhan; penolakan, keputusan tidak valid/ganda, dan kegagalan pencatatan juga diperiksa pada tes manager.

## Batasan

- Tombol pembatalan dashboard membatalkan sesi ACP dan membersihkan process group.
- Transkrip dan keluaran SSE disaring dari rahasia yang dikenal, termasuk kredensial terbelah antarchunk.
- Mode otomatis hanya untuk izin ACP yang dikirim agen; tidak mengubah mode internal agen.
- Keputusan izin tetap memeriksa sesi aktif; jika sesi berakhir, permintaan tidak dapat disetujui.

Tes pipeline dan dashboard sekarang memakai kontrak produksi yang membangun prompt di server. Hasil verifikasi ada di `testing.md`; panggilan akun agen asli dilakukan terpisah.
