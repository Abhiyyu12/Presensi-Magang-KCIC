import type { FastifyReply, FastifyRequest } from 'fastify';
import { randomBytes } from 'node:crypto';
import { forbidden } from '../../common/errors.js';
import { loadEnv, isDev, parseOriginList } from '../../config/env.js';

export const CSRF_COOKIE = 'csrf_token';
export const CSRF_HEADER = 'x-csrf-token';

/** Issue a CSRF token as a readable (non-HttpOnly) cookie; double-submit pattern. */
export function issueCsrfToken(reply: FastifyReply): string {
  const token = randomBytes(24).toString('hex');
  reply.setCookie(CSRF_COOKIE, token, {
    httpOnly: false,
    sameSite: 'lax',
    secure: loadEnv().COOKIE_SECURE,
    path: '/',
  });
  return token;
}

function originMatches(req: FastifyRequest): boolean {
  const env = loadEnv();
  const allowed = new Set([
    env.APP_URL,
    ...parseOriginList(env.CORS_ORIGIN),
    ...(isDev(env) ? ['http://localhost:5173', 'http://127.0.0.1:5173'] : []),
  ]);
  const origin = req.headers.origin;
  if (origin) return allowed.has(origin);
  const referer = req.headers.referer;
  if (referer) {
    try {
      return allowed.has(new URL(referer).origin);
    } catch {
      return false;
    }
  }
  // No Origin/Referer: same-origin clients (curl/scripts) — only allowed in dev/test.
  return env.NODE_ENV !== 'production';
}

export function assertCsrf(req: FastifyRequest): void {
  if (!originMatches(req)) throw forbidden('Origin tidak diizinkan.');
  const cookieToken = (req.cookies as Record<string, string | undefined>)[CSRF_COOKIE];
  const headerToken = req.headers[CSRF_HEADER];
  if (!cookieToken || typeof headerToken !== 'string' || headerToken.length < 16 || headerToken !== cookieToken) {
    throw forbidden('Token CSRF tidak valid. Muat ulang halaman lalu coba lagi.');
  }
}
