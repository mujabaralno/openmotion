# Keamanan API

Guard keamanan API diterapkan untuk seluruh rute di bawah `/api/*`. Tujuannya: situs lain yang dibuka di browser tidak bisa membaca data atau menjalankan tindakan melalui server lokal Workflow Studio.

## Aturan akses

| Pemeriksaan | Aturan |
|-------------|--------|
| Host | Harus `127.0.0.1:<APP_PORT>` atau `localhost:<APP_PORT>` |
| Origin | Jika header `Origin` ada, harus `http://127.0.0.1:<APP_PORT>` atau `http://localhost:<APP_PORT>` |
| Permintaan lintas situs | Header `Sec-Fetch-Site: cross-site` selalu ditolak |
| Baca tanpa Origin | `GET`, `HEAD`, dan `OPTIONS` boleh tanpa Origin (pengecualian baca) |
| Tulis tanpa Origin | `POST`, `PUT`, `PATCH`, dan `DELETE` tanpa Origin selalu ditolak |
| Token | Wajib untuk semua metode yang mengubah keadaan |

`APP_PORT` default `3000`. Jika server dijalankan di port lain, set `APP_PORT` di `.env.local` (misalnya `APP_PORT=4000`) agar Host/Origin yang sah ikut menyesuaikan. Jika tidak, guard akan menolak permintaan yang sebenarnya sah.

Semua penolakan mengembalikan `403 Forbidden` dengan body generik `{ "error": "Forbidden" }`. Body dan log tidak memuat token atau alasan detail.

## Token per-start

- Saat server dinyalakan, `src/instrumentation.ts` membuat token acak 32 byte (64 karakter hex).
- Token disimpan di `data/runtime/server-token` dengan permission `0600`; foldernya `0700` dan seluruh `data/` di-gitignore.
- Token yang sama dipakai selama server berjalan.
- Saat server restart, token baru dibuat; token lama otomatis tidak berlaku.
- Jika file token hilang atau tidak valid, guard menolak semua tindakan yang mengubah keadaan (fail closed).
- Token tidak pernah dikirim ke browser sebagai teks, tidak masuk log, dan tidak boleh ditaruh di URL atau body.

## Cara UI mendapat dan mengirim token

UI tidak perlu menyalin token secara manual:

1. Saat halaman dimuat, `SecurityBootstrap` memanggil `GET /api/security/session`.
2. Proxy mengirim token sebagai cookie `workflow_studio_token` dengan atribut `HttpOnly`, `SameSite=Strict`, `Path=/`, dan `Secure=false` (karena server lokal memakai HTTP).
3. Browser mengirim cookie itu otomatis pada setiap `fetch` same-origin berikutnya. `HttpOnly` mencegah JavaScript (termasuk situs lain) membacanya.
4. Setelah restart, cookie lama akan diganti pada respons GET pertama yang sah, sehingga UI otomatis memakai token baru.

Untuk skrip atau alat uji non-browser, token boleh dikirim lewat header `x-workflow-token`. Nilai token bisa dibaca dari `data/runtime/server-token` di mesin yang sama. Jangan pernah menempelkan nilainya ke dokumen, issue, atau log.

Catatan: gunakan satu asal saja (`127.0.0.1` atau `localhost`). Cookie dan Origin tidak otomatis berlaku lintas kedua nama tersebut.

## Menambahkan API baru

1. Letakkan route handler di `src/app/api/**/route.ts`. Proxy memakai matcher `/api/:path*`, jadi semua rute baru otomatis melewati guard.
2. Gunakan `GET`/`HEAD` untuk operasi baca dan metode tulis hanya untuk tindakan yang benar-benar mengubah keadaan.
3. Jangan menambahkan pengecualian matcher untuk rute API.
4. Jangan menambahkan header CORS dan jangan menerima token dari query string atau body.
5. Proxy adalah lapisan perimeter, bukan pengganti otorisasi. Route handler tetap harus memvalidasi input dan memeriksa apakah tindakan itu boleh dilakukan.
6. Route Handler bukan Server Action. Jika nanti memakai Server Action, ingat bahwa Server Action dikirim sebagai `POST` ke halaman (bukan `/api/*`) sehingga tidak tercakup matcher ini; tambahkan pemeriksaan token di dalam action tersebut atau hindari pemakaiannya untuk tindakan sensitif.

Rute uji yang tersedia sekarang:

- `GET /api/security/session` — memicu cookie token (bootstrap UI).
- `GET /api/security/check` — contoh rute baca.
- `POST /api/security/check` — contoh rute tulis yang membutuhkan Origin dan token.

## Pengujian

Unit test (tidak menjalankan server):

```bash
npm test
```

Menguji aturan Host/Origin/token, pengecualian baca, penolakan lintas situs, token lama setelah restart, dan bukti bahwa aksi tidak dijalankan saat guard menolak.

Tes integrasi (menjalankan server Next terisolasi di folder sementara):

```bash
npm run test:security
```

Tes ini menyalin aplikasi ke folder sementara agar tidak mengganggu dev server yang sedang berjalan, lalu memeriksa 23 skenario: cookie HttpOnly/SameSite, permintaan sah dengan header dan cookie, penolakan Host/Origin/token, situs lain tidak bisa mengambil token, token tidak bocor di respons, dan token berganti setelah restart.

## File terkait

| File | Fungsi |
|------|--------|
| `src/proxy.ts` | Proxy Next.js untuk seluruh `/api/*` |
| `src/server/security/guard.ts` | Aturan Host/Origin/token yang bisa dites |
| `src/server/security/policy.ts` | Daftar Host/Origin yang diizinkan dan pembacaan token |
| `src/server/security/token.ts` | Pembuatan, penyimpanan, dan pembacaan token |
| `src/instrumentation.ts` | Membuat token baru saat server start |
| `src/components/SecurityBootstrap.tsx` | Meminta cookie token saat UI dimuat |
| `tests/security-*.test.mts` | Unit test |
| `scripts/security-smoke.mjs` | Tes integrasi |

## Batasan

- Aplikasi ini hanya untuk `127.0.0.1`, bukan untuk deploy publik.
- Guard tidak menggantikan penjagaan path workspace (M0-3) atau otorisasi fitur.
- Token disimpan sebagai file lokal; proses lain dengan user yang sama di komputer itu secara teknis bisa membacanya. Model ancaman di sini adalah situs lain di browser, bukan malware lokal.
- `WORKFLOW_TOKEN_PATH` hanya dipakai oleh tes integrasi untuk memisahkan file token; jangan set di pemakaian normal.
