#!/usr/bin/env bash
# Generate apps/api/.env for host-run commands (prisma CLI, vitest, tsx),
# translating docker-internal hostnames/ports to localhost-bound ports.
set -euo pipefail
cd "$(dirname "$0")/../.."
[ -f .env ] || { echo "root .env missing"; exit 1; }
mkdir -p apps/api
DB_HOST_PORT=$(grep -E '^DB_HOST_PORT=' .env | cut -d= -f2 || true); DB_HOST_PORT=${DB_HOST_PORT:-5433}
MINIO_HOST_PORT=$(grep -E '^MINIO_HOST_PORT=' .env | cut -d= -f2 || true); MINIO_HOST_PORT=${MINIO_HOST_PORT:-9002}
sed -e "s|@db:5432|@127.0.0.1:$DB_HOST_PORT|" \
    -e 's|^MINIO_ENDPOINT=.*|MINIO_ENDPOINT=127.0.0.1|' \
    -e "s|^MINIO_PORT=.*|MINIO_PORT=$MINIO_HOST_PORT|" \
    -e 's|^NODE_ENV=.*|NODE_ENV=development|' \
    .env > apps/api/.env
echo "apps/api/.env generated (db=127.0.0.1:$DB_HOST_PORT minio=127.0.0.1:$MINIO_HOST_PORT)"
