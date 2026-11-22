import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';

export type Session = { cookie: string; csrf: string };

export async function login(app: FastifyInstance, username: string, password: string): Promise<Session> {
  const csrfRes = await app.inject({ method: 'GET', url: '/api/v1/auth/csrf' });
  const initialCsrf = csrfRes.cookies.find((c) => c.name === 'csrf_token')?.value ?? '';
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: {
      cookie: `csrf_token=${initialCsrf}`,
      'x-csrf-token': initialCsrf,
      origin: 'http://localhost:5173',
    },
    payload: { username, password },
  });
  const sid = res.cookies.find((c) => c.name === 'sid')?.value;
  const csrf = res.cookies.find((c) => c.name === 'csrf_token')?.value ?? initialCsrf;
  if (res.statusCode !== 200 || !sid) {
    throw new Error(`login failed for ${username}: ${res.statusCode} ${res.body}`);
  }
  return { cookie: `sid=${sid}; csrf_token=${csrf}`, csrf };
}

export function authHeaders(session: Session, extra: Record<string, string> = {}): Record<string, string> {
  return {
    cookie: session.cookie,
    'x-csrf-token': session.csrf,
    origin: 'http://localhost:5173',
    ...extra,
  };
}

export function getHeaders(session: Session): Record<string, string> {
  return { cookie: session.cookie };
}

export function buildMultipart(
  fields: Record<string, string>,
  file?: { field: string; filename: string; contentType: string; content: Buffer },
): { body: Buffer; contentType: string } {
  const boundary = `----presensitest${crypto.randomBytes(8).toString('hex')}`;
  const parts: Buffer[] = [];
  for (const [k, v] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  }
  if (file) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${file.field}"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`,
      ),
    );
    parts.push(file.content);
    parts.push(Buffer.from('\r\n'));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

export async function makeJpeg(width = 640, height = 480): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  return sharp({
    create: { width, height, channels: 3, background: { r: 120, g: 160, b: 200 } },
  })
    .jpeg()
    .toBuffer();
}

export function envelope(res: { body: string }): any {
  return JSON.parse(res.body);
}
