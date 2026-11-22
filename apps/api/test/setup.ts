import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(here, '..');

dotenv.config({ path: path.join(apiRoot, '.env') });

const devUrl = process.env.DATABASE_URL ?? '';
if (!devUrl) throw new Error('DATABASE_URL missing (run infra/scripts/gen-host-env.sh)');
const testUrl = devUrl.replace(/\/[^/?]+(\?|$)/, '/attendance_test$1');
process.env.DATABASE_URL = testUrl;
process.env.NODE_ENV = 'test';

const run = (cmd: string, env?: NodeJS.ProcessEnv) =>
  execSync(cmd, { cwd: apiRoot, stdio: 'pipe', env: { ...process.env, ...env }, shell: true });

function execSql(url: string, sql: string) {
  const f = path.join(os.tmpdir(), `presensi-setup-${Date.now()}-${Math.random().toString(36).slice(2)}.sql`);
  fs.writeFileSync(f, sql);
  try {
    run(`pnpm exec prisma db execute --url "${url}" --file "${f}"`);
    return true;
  } catch {
    return false;
  } finally {
    fs.rmSync(f, { force: true });
  }
}

// Deterministic clean slate: tests mutate state (deactivate users, fixed
// idempotency keys, corrections), so drop+recreate the test DB each run.
// Set KEEP_TEST_DB=1 to skip the reset for faster debugging iterations.
if (process.env.KEEP_TEST_DB !== '1') {
  execSql(devUrl, 'DROP DATABASE IF EXISTS attendance_test WITH (FORCE)');
}
execSql(devUrl, 'CREATE DATABASE attendance_test');

// Apply migrations from the current state, then run deterministic seed.
run('pnpm exec prisma migrate deploy', { DATABASE_URL: testUrl });
run('pnpm exec tsx prisma/seed.ts', {
  DATABASE_URL: testUrl,
  BOOTSTRAP_ADMIN_USERNAME: 'test-bootstrap-admin',
  BOOTSTRAP_ADMIN_PASSWORD: 'BootstrapTest123!',
});
