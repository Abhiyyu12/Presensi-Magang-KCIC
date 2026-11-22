#!/usr/bin/env bash
# Local backup: PostgreSQL dump + MinIO bucket mirror into ./backups/<timestamp>/
set -euo pipefail
cd "$(dirname "$0")/../.."
TS=$(date +%Y%m%d-%H%M%S)
DEST="backups/$TS"
mkdir -p "$DEST/minio"
source <(grep -E '^(POSTGRES_USER|POSTGRES_DB|MINIO_ROOT_USER|MINIO_ROOT_PASSWORD|MINIO_BUCKET_ATTENDANCE|MINIO_BUCKET_HELP)=' .env)
echo "Backing up PostgreSQL..."
docker compose exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -F c -f /tmp/backup.dump
docker compose cp db:/tmp/backup.dump "$DEST/postgres.dump"
echo "Backing up MinIO buckets..."
docker run --rm --network presensi-kcic_default -v "$(pwd)/$DEST/minio:/backup" --entrypoint sh minio/mc:RELEASE.2024-10-08T09-37-26Z -c "
  mc alias set local http://minio:9000 '$MINIO_ROOT_USER' '$MINIO_ROOT_PASSWORD' &&
  mc mirror -q local/$MINIO_BUCKET_ATTENDANCE /backup/$MINIO_BUCKET_ATTENDANCE &&
  mc mirror -q local/$MINIO_BUCKET_HELP /backup/$MINIO_BUCKET_HELP"
echo "Backup complete: $DEST"
