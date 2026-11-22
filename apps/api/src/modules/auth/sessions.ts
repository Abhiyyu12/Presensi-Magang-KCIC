import type { PrismaClient, User } from '@prisma/client';
import { generateToken, sha256 } from './password.js';
import { loadEnv } from '../../config/env.js';

export const SESSION_COOKIE = 'sid';

export async function createSession(db: PrismaClient, userId: string, userAgent?: string, ip?: string) {
  const env = loadEnv();
  const token = generateToken(32);
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_HOURS * 3600 * 1000);
  await db.session.create({
    data: {
      userId,
      tokenHash: sha256(token),
      expiresAt,
      userAgentHash: userAgent ? sha256(userAgent) : null,
      ipHash: ip ? sha256(ip) : null,
    },
  });
  return { token, expiresAt };
}

export async function resolveSessionUser(db: PrismaClient, token: string): Promise<User | null> {
  const session = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  });
  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  if (session.user.accountStatus !== 'ACTIVE') return null;
  // Throttle last_seen updates to once per minute to limit write load.
  if (!session.lastSeenAt || Date.now() - session.lastSeenAt.getTime() > 60_000) {
    await db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
  }
  return session.user;
}

export async function revokeSessionByToken(db: PrismaClient, token: string): Promise<void> {
  await db.session
    .updateMany({ where: { tokenHash: sha256(token), revokedAt: null }, data: { revokedAt: new Date() } })
    .catch(() => undefined);
}

export async function revokeAllUserSessions(db: PrismaClient, userId: string): Promise<void> {
  await db.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function purgeExpiredSessions(db: PrismaClient): Promise<void> {
  await db.session.deleteMany({
    where: { OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { lt: new Date(Date.now() - 7 * 864e5) } }] },
  });
}
