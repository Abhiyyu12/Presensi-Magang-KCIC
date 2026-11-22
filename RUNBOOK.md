# LOCAL RUNBOOK — Presensi Magang KCIC

## Environment scope

This runbook is for local development only. Do not use real participant personal data or production credentials.

## First-time setup

The coding agent must make these steps executable and keep this document synchronized with actual scripts:

1. Install Docker Desktop and ensure Docker Compose v2 works.
2. Install the pinned Node.js and pnpm versions.
3. Copy `.env.example` to `.env`.
4. Generate strong local-only secrets; never reuse production secrets.
5. Run the repository preflight/doctor command.
6. Build and start services.
7. Wait for PostgreSQL and MinIO readiness.
8. Run migrations.
9. Run deterministic development seed.
10. Verify `/health/live`, `/health/ready`, web UI, OpenAPI JSON, and private MinIO buckets. Local URLs (host ports from `.env`): web `http://localhost:5174`, API `http://localhost:3002/api/v1`, OpenAPI JSON `http://localhost:3002/api/v1/docs/json` (no Swagger UI is registered), MinIO console `http://localhost:9003` (API 9002, PostgreSQL 5433).
11. Login using the development account created by the seed process and change its password.

Note — MinIO init prerequisite: `minio-init` runs `infra/scripts/minio-init.mjs` with the static `mc` binary bind-mounted from `infra/bin/mc` (gitignored). Download it host-side from the official `minio/mc` GitHub releases (`dl.min.io` no longer serves binaries — the project was archived). The script prefers the mounted binary and has a GitHub-release download fallback, but the host-side binary is the reliable path because the init container may lack DNS (see BUILD_LOG).

## Daily development

- Start: documented `docker compose up` or package script.
- Logs: documented service-specific logs command.
- Stop: stop containers without deleting named volumes.
- Tests: lint, typecheck, unit, integration, API (`pnpm lint`, `pnpm typecheck`, `pnpm test`). E2E terotomasi BELUM DIOTOMASI — direncanakan; verifikasi browser saat ini = skrip Playwright ad-hoc di luar repo.
- Migrations: run only through the migration command.

## Reset

A destructive reset removes local PostgreSQL and MinIO volumes. It must:
- Explain exactly what will be deleted.
- Require an explicit confirmation flag or interactive confirmation.
- Never run automatically as part of normal startup.
- Recreate schema and dummy seed after reset.

## Backup and restore

The agent must provide local scripts to:
- Export PostgreSQL data.
- Back up MinIO buckets.
- Restore both into a clean local environment.
- Verify row counts and object checksums after restore.

## Troubleshooting

Document actual fixes for:
- Docker daemon stopped.
- Port already in use.
- Missing or malformed `.env`.
- Database startup/connection failure.
- Migration drift or failed migration.
- MinIO not ready or bucket/policy missing (check `infra/bin/mc` exists — see setup note; `docker compose logs minio-init`).
- Browser camera/geolocation permission denied.
- Upload timeout/network interruption.
- Playwright browser installation failure (only relevant to the ad-hoc browser-check scripts outside the repo; Playwright is not a repo dependency).
- Windows path/line-ending/permission issues.
