# Presensi Magang KCIC — RUNBOOK lokal

Aplikasi presensi magang (modular monolith): Fastify 5 + Prisma 5 + PostgreSQL 17 + MinIO, frontend React 18 + Vite. **Hanya untuk lingkungan lokal/development. Bukan untuk production. Seluruh data adalah dummy.**

## Prasyarat

- Docker Desktop (Compose v2)
- Node.js 22.x di host dan pnpm 9 (`npm i -g pnpm@9.15.9`)
- Port host bebas: 5433 (Postgres), 9002/9003 (MinIO), 3002 (API), 5174 (Web). Stack Docker lain (`kcic-*`) yang memakai 5432/9000/9001 tidak disentuh.

## Menjalankan (satu perintah)

```bash
cp .env.example .env   # lalu isi secret acak (setup.sh juga bisa membuatkan)
bash infra/scripts/setup.sh
```

setup.sh: preflight → generate `.env` host (127.0.0.1 + port remap) → `docker compose up -d db minio minio-init` → tunggu sehat → `pnpm install` → prisma migrate + seed → `docker compose up -d --build` (api, api-migrate, web).

Akses:
- Web: http://localhost:5174
- API: http://localhost:3002/api/v1 (health: `/health/live`, `/health/ready`)
- Swagger UI: http://localhost:3002/api/v1/docs (spec JSON: http://localhost:3002/api/v1/docs/json)
- MinIO console: http://localhost:9003

## Akun seed (dummy — password sama untuk semua kecuali bootstrap)

| Username | Password | Role |
|---|---|---|
| `dev-admin` (atau `BOOTSTRAP_ADMIN_USERNAME` di .env) | `BOOTSTRAP_ADMIN_PASSWORD` | ADMIN_IT + ADMIN_HR (wajib ganti password) |
| `admin-hr` | `DevPassword123!` | ADMIN_HR (scope GLOBAL) |
| `supervisor1` | `DevPassword123!` | SUPERVISOR (Budi Santoso) |
| `peserta1..3` | `DevPassword123!` | INTERN (MG-2026-001..003) |
| `bayu.pratama`, `maya.sari`, `fajar.nugroho`, `putri.maharani` | `DevPassword123!` | INTERN tambahan |

## Fitur per role

| Role | Menu utama | Kemampuan kunci |
|---|---|---|
| Peserta (INTERN) | Beranda, Absen, Izin, Riwayat, Bantuan, Profil | absen masuk/pulang dengan selfie+GPS (anti-duplikat via Idempotency-Key), ajukan izin (izin sementara/pulang awal) + pergerakan keluar-kembali, riwayat + unduh CSV pribadi, profil menampilkan penugasan/jadwal/pembimbing dan mengubah kontak sendiri |
| Pembimbing (SUPERVISOR) | Beranda, Monitoring, Izin Peserta, Laporan | pantau absensi peserta binaan (filter biro/divisi/pencarian), lihat pengajuan izin (baca saja), rekap + ekspor CSV/XLSX sesuai scope |
| Admin HR (ADMIN_HR) | Beranda, Monitoring, Approval, Laporan, Data Master, Audit | setujui/tolak izin dengan catatan wajib, koreksi absensi ber-alasan, kelola pengguna + import Excel, seluruh data master (organisasi, jadwal, kalender, kategori izin, parameter operasional) |
| Admin IT (ADMIN_IT) | Pengguna & Hak Akses, Audit | role/permission (pohon 7 menu + template Administrator/Pembimbing/Peserta), feature tree, policy ABAC, simulasi izin |

Menu dan tombol mengikuti permission efektif (lihat [docs/RBAC.md](docs/RBAC.md)); keputusan tetap dijalankan server per request.

## Dokumentasi

| Dokumen | Isi |
|---|---|
| [docs/USER_GUIDE.md](docs/USER_GUIDE.md) | panduan pengguna akhir (peserta/pembimbing/admin) |
| [docs/ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md) | panduan singkat admin: pengguna, import Excel, role, data master, koreksi |
| [docs/RBAC.md](docs/RBAC.md) | pohon permission, template role, aturan guard |
| [docs/DATA_FLOW.md](docs/DATA_FLOW.md) | peta halaman → API → tabel DB + konvensi error |
| [CHANGELOG.md](CHANGELOG.md) | riwayat perubahan per fase |

## Perintah penting

```bash
pnpm install                     # semua workspace
pnpm --filter api dev            # API dev (tsx watch, butuh apps/api/.env dari gen-host-env.sh)
pnpm --filter web dev            # web dev (proxy /api → API_PROXY_TARGET, default 127.0.0.1:3000)
pnpm --filter api build          # prisma generate + tsc
pnpm --filter api exec prisma migrate deploy
pnpm --filter api exec tsx prisma/seed.ts
pnpm --filter api test           # vitest: unit + API (DB terpisah attendance_test)
pnpm --filter api lint           # ESLint (config .eslintrc.cjs)
pnpm --filter web lint           # ESLint + react-hooks
pnpm --filter web test           # vitest unit (lib api & format)
bash infra/scripts/pipeline.sh   # install→generate→migrate→seed→typecheck→test (log: infra/pipeline.log)
bash infra/scripts/doctor.sh     # diagnosa env/port/container/health
docker compose up -d --build     # seluruh stack
docker compose down              # stop (data tetap)
bash infra/scripts/reset.sh      # HAPUS volume (ketik RESET untuk konfirmasi)
bash infra/scripts/backup.sh     # pg_dump + mirror MinIO ke backups/
```

## Variabel environment

Semua config runtime lewat env (divalidasi zod, fail-fast tanpa membocorkan secret). `.env` di-gitignore; salin dari `.env.example`. Compose meneruskan seluruh `.env` ke container API (`env_file`).

| Variabel | Default | Keterangan |
|---|---|---|
| `NODE_ENV` | `development` | `production` menolak seed kecuali `SEED_DEV_DATA=true` |
| `SEED_DEV_DATA` | — (wajib diisi) | `true` = api-migrate menjalankan seed dummy; hanya dev/test |
| `DATABASE_URL` | — (wajib) | Postgres; container memakai host `db`, host-dev memakai `127.0.0.1:5433` |
| `SESSION_SECRET` | — (wajib, ≥32 char) | Secret sesi; ganti dengan nilai acak panjang |
| `SESSION_TTL_HOURS` | `12` | Umur sesi cookie |
| `COOKIE_SECURE` | `false` | `true` bila HTTPS |
| `CORS_ORIGIN` | `http://localhost:5173` | Origin yang diizinkan (nilai tunggal; `APP_URL` selalu ikut diizinkan; dev menambah localhost:5173 otomatis) |
| `APP_URL` | `http://localhost:5173` | URL web untuk link/redirect |
| `API_PORT` / `WEB_PORT` | `3000` / `5173` (compose remap `3002`/`5174`) | Port host API/web |
| `DB_HOST_PORT` | `5432` (remap `5433`) | Port host Postgres |
| `MINIO_HOST_PORT` / `MINIO_CONSOLE_HOST_PORT` | `9000`/`9001` (remap `9002`/`9003`) | Port host MinIO |
| `MINIO_ENDPOINT` / `MINIO_PORT` / `MINIO_USE_SSL` | — / `9000` / `false` | Koneksi MinIO dari API |
| `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | — (wajib) | Kredensial aplikasi MinIO |
| `MINIO_BUCKET_ATTENDANCE` / `MINIO_BUCKET_HELP` | `attendance-evidence` / `help-media` | Bucket privat |
| `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` | — (wajib) | Kredensial root container MinIO |
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | — (wajib) | Init container db |
| `BOOTSTRAP_ADMIN_USERNAME` / `BOOTSTRAP_ADMIN_PASSWORD` | `dev-admin` / kosong | Akun admin pertama (wajib ganti password) |
| `MAX_UPLOAD_BYTES` | `8388608` (8 MB) | Batas upload bukti |
| `SIGNED_URL_TTL_SECONDS` | `120` | Umur presigned URL bukti |
| `BUSINESS_TIMEZONE` | `Asia/Jakarta` | Zona waktu bisnis (hari/jam kerja); juga TZ container |
| `LOG_LEVEL` | `info` | Level log API |
| `API_PROXY_TARGET` | `http://127.0.0.1:3000` | Khusus host-dev: target proxy `/api` vite |

Migrate & seed manual (host-dev): `pnpm --filter api exec prisma migrate deploy` lalu `pnpm --filter api exec tsx prisma/seed.ts` (butuh `apps/api/.env`; dibuat oleh `infra/scripts/gen-host-env.sh`). Di Docker, keduanya otomatis via service `api-migrate`.

Peta lengkap halaman → API → tabel DB dan daftar pengaturan yang bisa diubah tanpa deploy: [docs/DATA_FLOW.md](docs/DATA_FLOW.md).

## Arsitektur singkat

- **Waktu:** server otoritatif. Disimpan UTC; hari/jam bisnis Asia/Jakarta (`src/common/time.ts`).
- **Auth:** sesi opaque (cookie HttpOnly `sid`, hash sha256), CSRF double-submit + Origin allowlist, Argon2id, rate-limit login.
- **Authorization:** RBAC + ABAC (policy JSON) + ReBAC (assignment pembimbing, admin scope). Deny mengalahkan allow; role baru nol permission; default-deny pada filter query; IDOR → 404.
- **Absensi:** Idempotency-Key wajib; bukti selfie → validasi magic bytes → re-encode JPEG (EXIF dihapus) → MinIO privat → satu transaksi PG → compensating delete + marker ORPHANED bila gagal; presigned URL 120s + audit akses.
- **Izin:** state machine (PENDING/APPROVED/REJECTED/CANCELLED/DEPARTED/RETURNED/COMPLETED/NEEDS_REVIEW), early-checkout membuat event CHECK_OUT, sweep 15 menit untuk DEPARTED basi → NEEDS_REVIEW (tidak pernah auto-checkout).
- **Laporan:** baris dari WorkdaySnapshot; 13 metrik eksklusif; export CSV/XLSX ≤20.000 baris, tanpa foto/koordinat, diaudit.

## Navigasi & UX (hasil upgrade Fase 4)

- Mobile-first: bottom nav 4 item utama + tombol **Menu** (sheet berisi seluruh menu role); desktop sidebar ≤6 item utama + grup "Lainnya". Ikon SVG, label pendek satu sumber.
- Menu per role: Peserta = Beranda, Absen, Izin, Riwayat (+Bantuan, Profil); Pembimbing = Beranda, Monitoring, Izin Peserta, Laporan (+Bantuan, Profil); Admin HR = Beranda, Monitoring, Approval, Laporan, Data Master, Audit (+Bantuan, Profil); Admin IT = Beranda, Akses, Audit (+Bantuan, Profil).
- Beranda peserta menonjolkan status hari ini + tombol Absen Masuk/Pulang; hari non-kerja dijelaskan di muka; pengingat in-app bila belum absen pulang lewat jam jadwal.
- Riwayat: chip preset 7 hari / 30 hari / Bulan ini + unduh CSV riwayat pribadi.
- Panduan pengguna sederhana: [docs/USER_GUIDE.md](docs/USER_GUIDE.md). Temuan & keputusan audit UX: [docs/AUDIT.md](docs/AUDIT.md). Riwayat perubahan: [CHANGELOG.md](CHANGELOG.md).

## Keputusan KCIC yang masih PENDING (jangan dikarang)

Jam kerja resmi, toleransi telat (sekarang usulan 15 menit), hari kerja default (usulan Sen–Jum), dan kategori izin resmi ditandai `PENDING_KCIC_CONFIRMATION` pada seed/business parameters. Ganti via UI Data Master setelah kebijakan resmi tersedia.

## Troubleshooting

- `pnpm install` ECONNRESET ke registry.npmjs.org → pipeline memakai mirror `registry.npmmirror.com`; atau ulangi `pnpm install`.
- Image `minio/mc` tidak tersedia → init memakai `infra/scripts/minio-init.mjs` dengan biner statis `mc` yang di-bind-mount dari `infra/bin/mc` (diunduh host-side dari release GitHub minio/mc; dl.min.io sudah tidak melayani biner). Bila `infra/bin/mc` hilang, unduh ulang sesuai URL di `minio-init.mjs` dan verifikasi `mc.sha256sum`.
- Port bentrok → ubah `DB_HOST_PORT`/`MINIO_HOST_PORT`/`MINIO_CONSOLE_HOST_PORT`/`API_PORT`/`WEB_PORT` di `.env`.
- API tidak sehat → `docker compose logs api`; pastikan `api-migrate` sukses (`docker compose logs api-migrate`).
