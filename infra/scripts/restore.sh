#!/usr/bin/env bash
# Restore from a backup created by backup.sh. Usage: bash infra/scripts/restore.sh backups/<timestamp>
set -euo pipefail
cd "$(dirname "$0")/../.."
SRC="${1:?Usage: restore.sh backups/<timestamp>}"
[ -d "$SRC" ] || { echo "backup dir not found: $SRC"; exit 1; }
echo "WARNING: this OVERWRITES current local database and MinIO bucket contents."
read -r -p 'Type the word RESTORE to continue: ' answer
[ "$answer" = "RESTORE" ] || { echo "Aborted."; exit 1; }
source <(grep -E '^(POSTGRES_USER|POSTGRES_DB|MINIO_ROOT_USER|MINIO_ROOT_PASSWORD|MINIO_BUCKET_ATTENDANCE|MINIO_BUCKET_HELP)=' .env)
docker compose up -d db minio
docker compose cp "$SRC/postgres.dump" db:/tmp/restore.dump
docker compose exec -T db sh -c "pg_restore -U '$POSTGRES_USER' -d '$POSTGRES_DB' --clean --if-exists /tmp/restore.dump" || true
docker run --rm --network presensi-kcic_default -v "$(pwd)/$SRC/minio:/backup" --entrypoint sh minio/mc:RELEASE.2024-10-08T09-37-26Z -c "
  mc alias set local http://minio:9000 '$MINIO_ROOT_USER' '$MINIO_ROOT_PASSWORD' &&
  mc mirror -q --overwrite /backup/$MINIO_BUCKET_ATTENDANCE local/$MINIO_BUCKET_ATTENDANCE &&
  mc mirror -q --overwrite /backup/$MINIO_BUCKET_HELP local/$MINIO_BUCKET_HELP"
echo "Restore complete from $SRC"
