#!/usr/bin/env bash
# Preflight checks: docker daemon, .env, ports, containers, DB/MinIO readiness, migration state.
set -uo pipefail
cd "$(dirname "$0")/../.."
FAIL=0
ok()   { echo "  [OK]   $1"; }
bad()  { echo "  [FAIL] $1"; FAIL=1; }
warn() { echo "  [WARN] $1"; }

echo "== Docker =="
docker info >/dev/null 2>&1 && ok "docker daemon running" || bad "docker daemon not running"
docker compose version >/dev/null 2>&1 && ok "docker compose available" || bad "docker compose missing"

echo "== Files =="
[ -f .env ] && ok ".env exists" || bad ".env missing (copy from .env.example)"
[ -f pnpm-lock.yaml ] && ok "lockfile exists" || warn "pnpm-lock.yaml missing"

echo "== Ports (127.0.0.1) =="
for p in 3000 5173 5432 9000 9001; do
  if netstat -an 2>/dev/null | grep -q "127.0.0.1:$p .*LISTEN"; then
    ok "port $p bound"
  else
    warn "port $p not listening (service may be down)"
  fi
done

echo "== Containers =="
for s in db minio api web; do
  c=$(docker compose ps --status running --services 2>/dev/null | grep -x "$s" || true)
  [ -n "$c" ] && ok "$s running" || warn "$s not running"
done

echo "== Dependencies ready =="
curl -sf http://127.0.0.1:3000/health/live >/dev/null 2>&1 && ok "api live" || bad "api /health/live not reachable"
curl -sf http://127.0.0.1:3000/health/ready >/dev/null 2>&1 && ok "api ready (db+minio)" || bad "api /health/ready failing"
curl -sf http://127.0.0.1:5173/ >/dev/null 2>&1 && ok "web reachable" || warn "web not reachable"

echo "== Migrations =="
if [ -f apps/api/.env ]; then
  export $(grep -E '^DATABASE_URL=' apps/api/.env | xargs)
fi
docker compose exec -T db psql -U "${POSTGRES_USER:-attendance_app}" -d "${POSTGRES_DB:-attendance_dev}" -c 'select migration_name from _prisma_migrations order by finished_at desc limit 3;' >/dev/null 2>&1 \
  && ok "prisma migrations table present" || bad "no migrations applied (run pnpm db:migrate or docker compose up api-migrate)"

echo ""
[ $FAIL -eq 0 ] && echo "Doctor: PASS" || { echo "Doctor: FAIL — fix items above"; exit 1; }
