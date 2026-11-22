#!/usr/bin/env bash
# DESTRUCTIVE reset: removes containers AND named volumes (PostgreSQL + MinIO data are deleted).
set -euo pipefail
cd "$(dirname "$0")/../.."
echo "WARNING: this DELETES all local database and object-storage data (volumes postgres_data, minio_data)."
read -r -p 'Type the word RESET to continue: ' answer
if [ "$answer" != "RESET" ]; then echo "Aborted."; exit 1; fi
docker compose down -v --remove-orphans
echo "Volumes removed. Run 'pnpm setup' or 'docker compose up -d --build' to rebuild from scratch."
