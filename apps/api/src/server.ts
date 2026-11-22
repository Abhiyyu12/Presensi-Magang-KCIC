import { buildApp, ensureBuckets } from './app/buildApp.js';
import { loadEnv } from './config/env.js';
import { getDb, disconnectDb } from './infrastructure/db.js';
import { purgeExpiredSessions } from './modules/auth/sessions.js';
import { sweepStaleTemporaryLeaves } from './modules/attendance/service.js';

async function main(): Promise<void> {
  const env = loadEnv();
  await ensureBuckets();
  const app = await buildApp();

  // Periodic housekeeping: expired sessions + stale temporary leaves (NEEDS_REVIEW).
  const housekeeping = setInterval(() => {
    const db = getDb();
    purgeExpiredSessions(db).catch((e) => app.log.error({ err: e }, 'session purge failed'));
    sweepStaleTemporaryLeaves(db).catch((e) => app.log.error({ err: e }, 'leave sweep failed'));
  }, 15 * 60 * 1000);
  housekeeping.unref?.();

  const shutdown = async (signal: string) => {
    app.log.info(`received ${signal}, shutting down`);
    clearInterval(housekeeping);
    await app.close();
    await disconnectDb();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ port: env.PORT, host: '0.0.0.0' });
}

main().catch((err) => {
  // Fail fast with a safe message (no secret values).
  console.error('Startup failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
