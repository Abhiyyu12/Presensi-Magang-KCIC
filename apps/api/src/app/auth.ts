import type { FastifyInstance, FastifyRequest } from 'fastify';
import { unauthorized, forbidden } from '../common/errors.js';
import { getDb } from '../infrastructure/db.js';
import { resolveSessionUser, SESSION_COOKIE } from '../modules/auth/sessions.js';
import { assertCsrf } from '../modules/auth/csrf.js';
import { loadAccessContext, hasPermission, type AccessContext } from '../modules/access/context.js';

declare module 'fastify' {
  interface FastifyRequest {
    accessCtx: AccessContext | undefined;
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export async function authenticate(req: FastifyRequest): Promise<AccessContext> {
  if (req.accessCtx) return req.accessCtx;
  if (!SAFE_METHODS.has(req.method)) assertCsrf(req);
  const token = (req.cookies as Record<string, string | undefined>)[SESSION_COOKIE];
  if (!token) throw unauthorized();
  const db = getDb();
  const user = await resolveSessionUser(db, token);
  if (!user) throw unauthorized('Sesi tidak valid atau kedaluwarsa. Silakan login kembali.');
  const ctx = await loadAccessContext(db, user.id);
  if (!ctx) throw unauthorized();
  if (ctx.user.accountStatus !== 'ACTIVE') throw forbidden('Akun Anda tidak aktif. Hubungi admin.');
  req.accessCtx = ctx;
  return ctx;
}

export function authorize(...permissionCodes: string[]) {
  return async (req: FastifyRequest): Promise<void> => {
    const ctx = await authenticate(req);
    for (const code of permissionCodes) {
      if (!hasPermission(ctx, code)) throw forbidden();
    }
  };
}

export function requireCtx(req: FastifyRequest): AccessContext {
  if (!req.accessCtx) throw unauthorized();
  return req.accessCtx;
}

export async function registerAuthDecorators(app: FastifyInstance): Promise<void> {
  app.decorateRequest('accessCtx', undefined);
}
