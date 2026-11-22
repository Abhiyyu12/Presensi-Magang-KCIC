import Fastify, { type FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import { serializerCompiler, validatorCompiler, jsonSchemaTransform } from 'fastify-type-provider-zod';
import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import { loadEnv, isDev, parseOriginList } from '../config/env.js';
import { getDb } from '../infrastructure/db.js';
import { AppError, errorEnvelope, tooManyRequests } from '../common/errors.js';
import { registerAuthDecorators } from './auth.js';
import { authRoutes } from '../modules/auth/routes.js';
import { attendanceRoutes } from '../modules/attendance/routes.js';
import { leaveRoutes } from '../modules/leaves/routes.js';
import { reportRoutes } from '../modules/reports/routes.js';
import { adminRoutes } from '../modules/admin/routes.js';
import { scheduleRoutes } from '../modules/schedules/routes.js';
import { accessRoutes } from '../modules/access/routes.js';
import { auditRoutes } from '../modules/audit/routes.js';
import { helpRoutes } from '../modules/help/routes.js';
import { dashboardRoutes } from '../modules/dashboard/routes.js';
import { profileRoutes } from '../modules/users/profileRoutes.js';
import { ensureBuckets, getMinio } from '../infrastructure/minio.js';

export async function buildApp(): Promise<FastifyInstance> {
  const env = loadEnv();
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      redact: {
        paths: [
          'req.headers.cookie', 'req.headers.authorization', 'req.headers["x-csrf-token"]',
          '*.password', '*.passwordHash', '*.tokenHash', '*.token', '*.secret',
        ],
        censor: '[REDACTED]',
      },
    },
    genReqId: () => randomUUID(),
    trustProxy: false,
    bodyLimit: 1 * 1024 * 1024,
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.setErrorHandler((error, req, reply) => {
    const requestId = req.id;
    if (error instanceof AppError) {
      const mapped = errorEnvelope(error, requestId);
      reply.code(mapped.status).send(mapped.body);
      return;
    }
    if (error instanceof ZodError) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of error.issues) {
        const path = issue.path.join('.') || '_';
        fieldErrors[path] = [...(fieldErrors[path] ?? []), issue.message];
      }
      reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Permintaan tidak valid.', fieldErrors, requestId },
      });
      return;
    }
    if ((error as { statusCode?: number }).statusCode === 429) {
      const mapped = errorEnvelope(tooManyRequests(), requestId);
      reply.code(429).send(mapped.body);
      return;
    }
    const fastifyStatus = (error as { statusCode?: number }).statusCode;
    if (typeof fastifyStatus === 'number' && fastifyStatus >= 400 && fastifyStatus < 500) {
      reply.code(fastifyStatus).send({
        error: {
          code: (error as { code?: string }).code ?? 'REQUEST_ERROR',
          message: (error as Error).message || 'Permintaan tidak valid.',
          requestId,
        },
      });
      return;
    }
    req.log.error({ err: { message: (error as Error).message, name: (error as Error).name } }, 'unhandled error');
    const mapped = errorEnvelope(error, requestId);
    reply.code(mapped.status).send(mapped.body);
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Presensi Magang KCIC API',
        version: '0.1.0',
        description: 'API MVP lokal — bukan layanan produksi. Semua waktu resmi berasal dari server (UTC, tampil WIB).',
      },
      servers: [{ url: '/api/v1' }],
    },
    transform: jsonSchemaTransform,
  });

  await app.register(helmet, { global: true });
  await app.register(cors, {
    origin: [
      ...parseOriginList(env.CORS_ORIGIN),
      env.APP_URL,
      ...(isDev(env) ? ['http://localhost:5173', 'http://127.0.0.1:5173'] : []),
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Idempotency-Key', 'x-csrf-token'],
  });
  await app.register(cookie);
  await app.register(rateLimit, { global: true, max: 600, timeWindow: '1 minute' });
  await app.register(multipart, {
    limits: { fileSize: env.MAX_UPLOAD_BYTES, files: 1, fields: 20 },
  });

  await registerAuthDecorators(app);

  // Health
  app.get('/health/live', async () => ({ status: 'ok' }));
  app.get('/health/ready', async (_req, reply) => {
    const checks: Record<string, boolean> = { db: false, minio: false };
    try {
      await getDb().$queryRaw`SELECT 1`;
      checks.db = true;
    } catch { /* not ready */ }
    try {
      checks.minio = await getMinio().bucketExists(env.MINIO_BUCKET_ATTENDANCE);
    } catch { /* not ready */ }
    const ready = checks.db && checks.minio;
    reply.code(ready ? 200 : 503);
    return { status: ready ? 'ready' : 'degraded', checks };
  });

  await app.register(async (v1) => {
    await v1.register(authRoutes);
    await v1.register(profileRoutes);
    await v1.register(dashboardRoutes);
    await v1.register(attendanceRoutes);
    await v1.register(leaveRoutes);
    await v1.register(reportRoutes);
    await v1.register(adminRoutes);
    await v1.register(scheduleRoutes);
    await v1.register(accessRoutes);
    await v1.register(auditRoutes);
    await v1.register(helpRoutes);
    v1.get('/docs/json', { schema: { hide: true } }, async () => v1.swagger());
  }, { prefix: '/api/v1' });

  app.setNotFoundHandler((req, reply) => {
    reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Endpoint tidak ditemukan.', requestId: req.id } });
  });

  return app;
}

export { ensureBuckets };
