import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getDb } from '../../infrastructure/db.js';
import { ok } from '../../common/http.js';
import { unauthorized, badRequest, forbidden } from '../../common/errors.js';
import { writeAudit, redactForAudit } from '../../common/audit.js';
import { verifyPassword, hashPassword, sha256, generateToken, passwordSchemaMin } from './password.js';
import { createSession, revokeSessionByToken, SESSION_COOKIE } from './sessions.js';
import { issueCsrfToken } from './csrf.js';
import { loadEnv } from '../../config/env.js';
import { authenticate, requireCtx } from '../../app/auth.js';
import { loadAccessContext } from '../access/context.js';

const loginBody = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
});

const changePasswordBody = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: z.string().min(passwordSchemaMin).max(256),
});

const resetPasswordBody = z.object({
  token: z.string().min(32).max(128),
  newPassword: z.string().min(passwordSchemaMin).max(256),
});

function userSummary(ctx: Awaited<ReturnType<typeof loadAccessContext>>) {
  if (!ctx) throw unauthorized();
  return {
    id: ctx.user.id,
    username: ctx.user.username,
    displayName: ctx.user.displayName,
    email: ctx.user.email,
    phone: ctx.user.phone,
    accountStatus: ctx.user.accountStatus,
    mustChangePassword: ctx.user.mustChangePassword,
    roles: ctx.roleCodes,
    permissions: [...ctx.permissions].sort(),
    internProfileId: ctx.internProfileId,
  };
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const db = getDb();
  const env = loadEnv();

  app.get('/auth/csrf', async (req, reply) => {
    const token = issueCsrfToken(reply);
    return ok({ token }, req.id);
  });

  app.post(
    '/auth/login',
    {
      schema: { body: loginBody },
      config: { rateLimit: { max: 30, timeWindow: '15 minutes' } },
    },
    async (req, reply) => {
      const { username, password } = loginBody.parse(req.body);
      const user = await db.user.findUnique({ where: { username } });
      // Generic message: never reveal whether the account exists.
      if (!user || user.accountStatus !== 'ACTIVE' || !(await verifyPassword(user.passwordHash, password))) {
        await writeAudit(db, {
          actorUserId: user?.id ?? null,
          action: 'AUTH_LOGIN_FAILED',
          objectType: 'user',
          objectId: user?.id ?? null,
          outcome: 'FAILURE',
          requestId: req.id,
        });
        throw unauthorized('Username atau password salah.');
      }

      const { token, expiresAt } = await createSession(db, user.id, req.headers['user-agent'], req.ip);
      reply.setCookie(SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: env.COOKIE_SECURE,
        path: '/',
        expires: expiresAt,
      });
      const csrfToken = issueCsrfToken(reply);
      await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      await writeAudit(db, { actorUserId: user.id, action: 'AUTH_LOGIN', objectType: 'user', objectId: user.id, requestId: req.id });

      const ctx = await loadAccessContext(db, user.id);
      if (!ctx) throw unauthorized();
      return ok({ user: userSummary(ctx), csrfToken }, req.id);
    },
  );

  app.post('/auth/logout', { preHandler: authenticate }, async (req, reply) => {
    const ctx = requireCtx(req);
    const token = (req.cookies as Record<string, string | undefined>)[SESSION_COOKIE];
    if (token) await revokeSessionByToken(db, token);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    await writeAudit(db, { actorUserId: ctx.user.id, action: 'AUTH_LOGOUT', objectType: 'user', objectId: ctx.user.id, requestId: req.id });
    return ok({ loggedOut: true }, req.id);
  });

  app.get('/auth/me', { preHandler: authenticate }, async (req) => {
    const ctx = requireCtx(req);
    return ok({ user: userSummary(ctx) }, req.id);
  });

  app.post('/auth/change-password', { schema: { body: changePasswordBody }, preHandler: authenticate }, async (req, reply) => {
    const ctx = requireCtx(req);
    const { currentPassword, newPassword } = changePasswordBody.parse(req.body);
    if (!(await verifyPassword(ctx.user.passwordHash, currentPassword))) {
      throw unauthorized('Password saat ini salah.');
    }
    if (currentPassword === newPassword) throw badRequest('Password baru harus berbeda dari password saat ini.');
    const passwordHash = await hashPassword(newPassword);
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: ctx.user.id }, data: { passwordHash, mustChangePassword: false } });
      await tx.session.updateMany({ where: { userId: ctx.user.id, revokedAt: null }, data: { revokedAt: new Date() } });
      await writeAudit(tx as never, {
        actorUserId: ctx.user.id,
        action: 'AUTH_CHANGE_PASSWORD',
        objectType: 'user',
        objectId: ctx.user.id,
        after: redactForAudit({ passwordHash }),
        requestId: req.id,
      });
    });
    // Re-login: issue a fresh rotated session.
    const { token, expiresAt } = await createSession(db, ctx.user.id, req.headers['user-agent'], req.ip);
    reply.setCookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: env.COOKIE_SECURE, path: '/', expires: expiresAt });
    issueCsrfToken(reply);
    return ok({ passwordChanged: true }, req.id);
  });

  app.post('/auth/reset-password', { schema: { body: resetPasswordBody }, config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } }, async (req) => {
    const { token, newPassword } = resetPasswordBody.parse(req.body);
    const tokenHash = sha256(token);
    const record = await db.passwordResetToken.findFirst({ where: { tokenHash, consumedAt: null, expiresAt: { gt: new Date() } } });
    // Generic failure: never reveal token/account existence.
    if (!record) throw forbidden('Token reset tidak valid atau kedaluwarsa.');
    const passwordHash = await hashPassword(newPassword);
    await db.$transaction(async (tx) => {
      await tx.passwordResetToken.update({ where: { id: record.id }, data: { consumedAt: new Date() } });
      await tx.user.update({ where: { id: record.userId }, data: { passwordHash, mustChangePassword: false } });
      await tx.session.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await writeAudit(tx as never, {
        actorUserId: record.userId,
        action: 'AUTH_RESET_PASSWORD',
        objectType: 'user',
        objectId: record.userId,
        requestId: req.id,
      });
    });
    return ok({ passwordReset: true }, req.id);
  });

  // Admin-issued one-time reset token (secure alternative to self-service recovery for MVP).
  app.post(
    '/admin/users/:userId/password-reset-token',
    { schema: { params: z.object({ userId: z.string().uuid() }) }, preHandler: authenticate },
    async (req) => {
      const ctx = requireCtx(req);
      if (!ctx.permissions.has('admin:users:manage')) throw forbidden();
      const { userId } = z.object({ userId: z.string().uuid() }).parse(req.params);
      const target = await db.user.findUnique({ where: { id: userId } });
      if (!target) throw badRequest('User tidak ditemukan.');
      const token = generateToken(32);
      await db.$transaction(async (tx) => {
        await tx.passwordResetToken.create({
          data: { userId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 3600 * 1000) },
        });
        await writeAudit(tx as never, {
          actorUserId: ctx.user.id,
          action: 'ADMIN_ISSUE_RESET_TOKEN',
          objectType: 'user',
          objectId: userId,
          reason: 'admin-issued password reset',
          requestId: req.id,
        });
      });
      // Shown once; never persisted in plaintext.
      return ok({ token, expiresInSeconds: 3600 }, req.id);
    },
  );
}
