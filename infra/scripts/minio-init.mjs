/**
 * minio-init without the (unavailable) minio/mc image:
 * uses the bind-mounted static `mc` binary (infra/bin/mc, downloaded host-side
 * from the minio/mc GitHub release — dl.min.io no longer serves binaries since
 * the project was archived) and performs bucket + least-privilege
 * service-account setup. Local development only.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, chmodSync } from 'node:fs';

const MC_URL = process.env.MC_URL || 'https://github.com/minio/mc/releases/download/RELEASE.2025-08-13T08-35-41Z/mc.linux-amd64.RELEASE.2025-08-13T08-35-41Z';
const MC_MOUNT = '/bin-mc/mc';
const MC_BIN = '/tmp/mc';
const ROOT_USER = process.env.MINIO_ROOT_USER;
const ROOT_PASS = process.env.MINIO_ROOT_PASSWORD;
const APP_KEY = process.env.MINIO_ACCESS_KEY;
const APP_SECRET = process.env.MINIO_SECRET_KEY;
const BUCKETS = [process.env.MINIO_BUCKET_ATTENDANCE || 'attendance-evidence', process.env.MINIO_BUCKET_HELP || 'help-media'];
const ENDPOINT = 'http://minio:9000';

async function waitForMinio() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${ENDPOINT}/minio/health/live`);
      if (res.ok) return;
    } catch { /* not up yet */ }
    console.log('waiting for minio...');
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error('minio not reachable');
}

async function downloadMc() {
  if (existsSync(MC_BIN)) return;
  const { writeFileSync, copyFileSync } = await import('node:fs');
  if (existsSync(MC_MOUNT)) {
    console.log('using mounted mc binary');
    copyFileSync(MC_MOUNT, MC_BIN);
    chmodSync(MC_BIN, 0o755);
    return;
  }
  console.log(`downloading mc from ${MC_URL}`);
  const res = await fetch(MC_URL);
  if (!res.ok) throw new Error(`failed to download mc: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(MC_BIN, buf);
  chmodSync(MC_BIN, 0o755);
}

function mc(...args) {
  return execFileSync(MC_BIN, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

await waitForMinio();
await downloadMc();
mc('alias', 'set', 'local', ENDPOINT, ROOT_USER, ROOT_PASS);
for (const b of BUCKETS) {
  try { mc('mb', '--ignore-existing', `local/${b}`); } catch (e) { console.log(`mb ${b}: ${e.message}`); }
  try { mc('anonymous', 'set', 'none', `local/${b}`); } catch { /* private by default */ }
}
const policy = {
  Version: '2012-10-17',
  Statement: [
    { Effect: 'Allow', Action: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'], Resource: BUCKETS.map((b) => `arn:aws:s3:::${b}/*`) },
    { Effect: 'Allow', Action: ['s3:ListBucket', 's3:GetBucketLocation'], Resource: BUCKETS.map((b) => `arn:aws:s3:::${b}`) },
  ],
};
const { writeFileSync } = await import('node:fs');
writeFileSync('/tmp/app-policy.json', JSON.stringify(policy));
try { mc('admin', 'user', 'add', 'local', APP_KEY, APP_SECRET); } catch (e) { console.log(`user add: ${e.message}`); }
try { mc('admin', 'policy', 'create', 'local', 'app-service-policy', '/tmp/app-policy.json'); } catch {
  try { mc('admin', 'policy', 'add', 'local', 'app-service-policy', '/tmp/app-policy.json'); } catch (e) { console.log(`policy: ${e.message}`); }
}
try { mc('admin', 'policy', 'attach', 'local', 'app-service-policy', '--user', APP_KEY); } catch {
  try { mc('admin', 'policy', 'set', 'local', 'app-service-policy', `user=${APP_KEY}`); } catch (e) { console.log(`attach: ${e.message}`); }
}
console.log('minio-init done: private buckets + least-privilege service user ready');
