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
- OpenAPI: http://localhost:3002/docs (JSON: `/docs/json`)
- MinIO console: http://localhost:9003

## Akun seed (dummy — password sama untuk semua kecuali bootstrap)

| Username | Password | Role |
|---|---|---|
| `dev-admin` (atau `BOOTSTRAP_ADMIN_USERNAME` di .env) | `BOOTSTRAP_ADMIN_PASSWORD` | ADMIN_IT + ADMIN_HR (wajib ganti password) |
| `admin-hr` | `DevPassword123!` | ADMIN_HR (scope GLOBAL) |
| `supervisor1` | `DevPassword123!` | SUPERVISOR |
| `peserta1..3` | `DevPassword123!` | INTERN (MG-2026-001..003) |

## Perintah penting

```bash
pnpm install                     # semua workspace
pnpm --filter api dev            # API dev (tsx watch, butuh apps/api/.env dari gen-host-env.sh)
pnpm --filter web dev            # web dev (proxy /api → 127.0.0.1:3000)
pnpm --filter api build          # prisma generate + tsc
pnpm --filter api exec prisma migrate deploy
pnpm --filter api exec tsx prisma/seed.ts
pnpm --filter api test           # vitest: unit + API (DB terpisah attendance_test)
bash infra/scripts/pipeline.sh   # install→generate→migrate→seed→typecheck→test (log: infra/pipeline.log)
bash infra/scripts/doctor.sh     # diagnosa env/port/container/health
docker compose up -d --build     # seluruh stack
docker compose down              # stop (data tetap)
bash infra/scripts/reset.sh      # HAPUS volume (ketik RESET untuk konfirmasi)
bash infra/scripts/backup.sh     # pg_dump + mirror MinIO ke backups/
```

## Arsitektur singkat

- **Waktu:** server otoritatif. Disimpan UTC; hari/jam bisnis Asia/Jakarta (`src/common/time.ts`).
- **Auth:** sesi opaque (cookie HttpOnly `sid`, hash sha256), CSRF double-submit + Origin allowlist, Argon2id, rate-limit login.
- **Authorization:** RBAC + ABAC (policy JSON) + ReBAC (assignment pembimbing, admin scope). Deny mengalahkan allow; role baru nol permission; default-deny pada filter query; IDOR → 404.
- **Absensi:** Idempotency-Key wajib; bukti selfie → validasi magic bytes → re-encode JPEG (EXIF dihapus) → MinIO privat → satu transaksi PG → compensating delete + marker ORPHANED bila gagal; presigned URL 120s + audit akses.
- **Izin:** state machine (PENDING/APPROVED/REJECTED/CANCELLED/DEPARTED/RETURNED/COMPLETED/NEEDS_REVIEW), early-checkout membuat event CHECK_OUT, sweep 15 menit untuk DEPARTED basi → NEEDS_REVIEW (tidak pernah auto-checkout).
- **Laporan:** baris dari WorkdaySnapshot; 13 metrik eksklusif; export CSV/XLSX ≤20.000 baris, tanpa foto/koordinat, diaudit.

## Keputusan KCIC yang masih PENDING (jangan dikarang)

Jam kerja resmi, toleransi telat (sekarang usulan 15 menit), hari kerja default (usulan Sen–Jum), dan kategori izin resmi ditandai `PENDING_KCIC_CONFIRMATION` pada seed/business parameters. Ganti via UI Data Master setelah kebijakan resmi tersedia.

## Troubleshooting

- `pnpm install` ECONNRESET ke registry.npmjs.org → pipeline memakai mirror `registry.npmmirror.com`; atau ulangi `pnpm install`.
- Image `minio/mc` tidak tersedia → init memakai `infra/scripts/minio-init.mjs` (unduh biner mc statis dari dl.min.io).
- Port bentrok → ubah `DB_HOST_PORT`/`MINIO_HOST_PORT`/`MINIO_CONSOLE_HOST_PORT`/`API_PORT`/`WEB_PORT` di `.env`.
- API tidak sehat → `docker compose logs api`; pastikan `api-migrate` sukses (`docker compose logs api-migrate`).
