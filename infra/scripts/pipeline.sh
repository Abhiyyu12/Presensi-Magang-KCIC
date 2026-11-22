#!/usr/bin/env bash
# Full backend pipeline: install (via mirror) -> generate -> migration -> constraints -> deploy -> seed -> typecheck -> tests
set -x
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT" || exit 1
LOG="$ROOT/infra/pipeline.log"
: > "$LOG"

pnpm config set registry https://registry.npmmirror.com >>"$LOG" 2>&1
export PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma

INSTALL_OK=0
for i in 1 2 3; do
  if [ -d apps/api/node_modules/fastify ] && [ -f pnpm-lock.yaml ]; then INSTALL_OK=1; echo "INSTALL OK (already present) attempt $i" >>"$LOG"; break; fi
  pnpm install >>"$LOG" 2>&1
  if [ -d apps/api/node_modules/fastify ] && [ -f pnpm-lock.yaml ]; then INSTALL_OK=1; echo "INSTALL OK attempt $i" >>"$LOG"; break; fi
  sleep 5
done
[ "$INSTALL_OK" = 1 ] || { echo "PIPELINE_FAIL install" >>"$LOG"; exit 1; }

cd apps/api || exit 1
pnpm exec prisma generate >>"$LOG" 2>&1 || { echo "PIPELINE_FAIL generate" >>"$LOG"; exit 1; }

MIG=prisma/migrations/0_init
mkdir -p "$MIG"
echo 'provider = "postgresql"' > prisma/migrations/migration_lock.toml
pnpm exec prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > "$MIG/migration.sql" 2>>"$LOG" || { echo "PIPELINE_FAIL diff" >>"$LOG"; exit 1; }

# Detect actual table/column names in generated SQL, then append supplementary constraints (DATA_MODEL §3).
tbl() { grep -oE 'CREATE TABLE "[^"]+"' "$MIG/migration.sql" | sed 's/CREATE TABLE "//; s/"//' | grep -i "$1" | head -1; }
col() { awk -v t="\"$1\"" -v c="$2" 'index($0,"CREATE TABLE " t){f=1;next} f&&/^\)/{f=0} f&&$1 ~ "^\"" c {gsub(/"/,"",$1);print $1;exit}' "$MIG/migration.sql"; }
LR=$(tbl leave_request); AD=$(tbl attendance_day); AE=$(tbl attendance_event); FO=$(tbl file_object)
{
  echo ''
  echo '-- Supplementary constraints (DATA_MODEL §3): one active TEMPORARY leave per intern per workday; coordinate/size bounds.'
  if [ -n "$LR" ]; then
    IPC=$(col "$LR" intern_profile); WD=$(col "$LR" work_date); LTYPE=$(col "$LR" leave_type); LST=$(col "$LR" status)
    [ -n "$IPC" ] && echo "CREATE UNIQUE INDEX \"${LR}_one_active_temporary\" ON \"${LR}\" (\"${IPC}\", \"${WD}\") WHERE \"${LTYPE}\" = 'TEMPORARY' AND \"${LST}\" IN ('PENDING','APPROVED','DEPARTED','RETURNED');"
  fi
  if [ -n "$AE" ]; then
    LAT=$(col "$AE" latitude); LNG=$(col "$AE" longitude)
    [ -n "$LAT" ] && echo "ALTER TABLE \"${AE}\" ADD CONSTRAINT \"${AE}_lat_range\" CHECK (\"${LAT}\" >= -90 AND \"${LAT}\" <= 90);"
    [ -n "$LNG" ] && echo "ALTER TABLE \"${AE}\" ADD CONSTRAINT \"${AE}_lng_range\" CHECK (\"${LNG}\" >= -180 AND \"${LNG}\" <= 180);"
  fi
  if [ -n "$FO" ]; then
    SB=$(col "$FO" size_bytes)
    [ -n "$SB" ] && echo "ALTER TABLE \"${FO}\" ADD CONSTRAINT \"${FO}_size_positive\" CHECK (\"${SB}\" > 0);"
  fi
} >> "$MIG/migration.sql"

export $(grep -v '^#' .env | grep -v '^$' | xargs) 2>/dev/null
pnpm exec prisma migrate deploy >>"$LOG" 2>&1 || { echo "PIPELINE_FAIL deploy" >>"$LOG"; exit 1; }
pnpm exec tsx prisma/seed.ts >>"$LOG" 2>&1 || { echo "PIPELINE_FAIL seed" >>"$LOG"; exit 1; }

pnpm exec tsc --noEmit > "$ROOT/infra/typecheck.log" 2>&1
echo "TSC_EXIT=$?" >> "$LOG"
pnpm exec vitest run > "$ROOT/infra/test.log" 2>&1
echo "VITEST_EXIT=$?" >> "$LOG"
tail -30 "$ROOT/infra/test.log" >> "$LOG"
echo "PIPELINE_DONE" >> "$LOG"
