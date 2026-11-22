#!/usr/bin/env bash
# First-time setup: start infra, generate host env, install deps, migrate, seed, build, start app stack.
set -euo pipefail
cd "$(dirname "$0")/../.."
ROOT=$(pwd)

echo "== Preflight =="
command -v docker >/dev/null || { echo "docker not found"; exit 1; }
docker info >/dev/null 2>&1 || { echo "docker daemon not running"; exit 1; }
[ -f .env ] || { echo ".env missing — copy .env.example to .env and set secrets"; exit 1; }
command -v pnpm >/dev/null || { echo "pnpm not found (npm i -g pnpm@9.15.9)"; exit 1; }

echo "== Generate host env for local (non-docker) commands =="
bash infra/scripts/gen-host-env.sh

echo "== Start db + minio =="
docker compose up -d db minio minio-init
echo "Waiting for db healthy..."
for i in $(seq 1 60); do
  status=$(docker inspect --format '{{.State.Health.Status}}' presensi-kcic-db-1 2>/dev/null || echo starting)
  [ "$status" = "healthy" ] && break
  sleep 2
done
[ "$status" = "healthy" ] || { echo "db not healthy"; exit 1; }

echo "== Install dependencies =="
pnpm install --frozen-lockfile

echo "== Migrate + seed (host) =="
pnpm db:migrate
pnpm db:seed

echo "== Build and start full stack =="
docker compose up -d --build
docker compose ps

echo ""
echo "Setup complete."
WEB_PORT=$(grep -E '^WEB_PORT=' .env | cut -d= -f2 || true); WEB_PORT=${WEB_PORT:-5174}
API_PORT=$(grep -E '^API_PORT=' .env | cut -d= -f2 || true); API_PORT=${API_PORT:-3002}
MINIO_CONSOLE_HOST_PORT=$(grep -E '^MINIO_CONSOLE_HOST_PORT=' .env | cut -d= -f2 || true); MINIO_CONSOLE_HOST_PORT=${MINIO_CONSOLE_HOST_PORT:-9003}
echo "  Web:  http://localhost:${WEB_PORT}"
echo "  API:  http://localhost:${API_PORT}/api/v1  (OpenAPI JSON: /api/v1/docs/json — no Swagger UI)"
echo "  MinIO console: http://localhost:${MINIO_CONSOLE_HOST_PORT}"
echo "  Bootstrap admin username: see BOOTSTRAP_ADMIN_USERNAME in .env (password in .env, must be changed on first login)"
