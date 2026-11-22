import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ok, paginationQuery, dateRangeQuery } from '../../common/http.js';
import { authenticate, requireCtx } from '../../app/auth.js';
import { authorize } from '../../app/auth.js';
import { readMultipart, requireIdempotencyKey, parseCoords } from '../../common/multipart.js';
import {
  submitAttendance, getToday, listAttendance, getAttendanceDetail, getEvidenceUrl, correctAttendance,
} from './service.js';

export async function attendanceRoutes(app: FastifyInstance): Promise<void> {
  app.get('/attendance/today', { preHandler: authenticate }, async (req) => {
    const ctx = requireCtx(req);
    return ok(await getToday(ctx, req.id), req.id);
  });

  app.post('/attendance/check-in', { preHandler: authenticate }, async (req, reply) => {
    const ctx = requireCtx(req);
    const idempotencyKey = requireIdempotencyKey(req);
    const { fields, file } = await readMultipart(req);
    const { latitude, longitude, accuracyMeters } = parseCoords(fields);
    const result = await submitAttendance(ctx, {
      eventType: 'CHECK_IN', latitude, longitude, accuracyMeters, idempotencyKey,
      clientSubmittedAt: fields.clientSubmittedAt ?? null,
      imageBuffer: file!.buffer, imageMime: file!.mimetype,
    }, req.id);
    reply.code(201);
    return ok(result, req.id);
  });

  app.post('/attendance/check-out', { preHandler: authenticate }, async (req, reply) => {
    const ctx = requireCtx(req);
    const idempotencyKey = requireIdempotencyKey(req);
    const { fields, file } = await readMultipart(req);
    const { latitude, longitude, accuracyMeters } = parseCoords(fields);
    const result = await submitAttendance(ctx, {
      eventType: 'CHECK_OUT', latitude, longitude, accuracyMeters, idempotencyKey,
      clientSubmittedAt: fields.clientSubmittedAt ?? null,
      imageBuffer: file!.buffer, imageMime: file!.mimetype,
    }, req.id);
    reply.code(201);
    return ok(result, req.id);
  });

  const listQuery = paginationQuery.merge(dateRangeQuery).extend({
    internProfileId: z.string().uuid().optional(),
    dayStatus: z.enum(['NOT_SCHEDULED', 'SCHEDULED', 'PRESENT', 'LATE', 'INCOMPLETE', 'NEEDS_REVIEW', 'EARLY_DEPARTURE_APPROVED']).optional(),
  });

  app.get('/attendance', { schema: { querystring: listQuery }, preHandler: authenticate }, async (req) => {
    const ctx = requireCtx(req);
    const q = listQuery.parse(req.query);
    const { items, total } = await listAttendance(ctx, q);
    return ok({ items, pagination: { page: q.page, pageSize: q.pageSize, total, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) } }, req.id);
  });

  app.get(
    '/attendance/:attendanceId',
    { schema: { params: z.object({ attendanceId: z.string().uuid() }) }, preHandler: authenticate },
    async (req) => {
      const ctx = requireCtx(req);
      const { attendanceId } = z.object({ attendanceId: z.string().uuid() }).parse(req.params);
      return ok(await getAttendanceDetail(ctx, attendanceId), req.id);
    },
  );

  app.get(
    '/attendance/:attendanceId/evidence',
    {
      schema: { params: z.object({ attendanceId: z.string().uuid() }), querystring: z.object({ eventId: z.string().uuid() }) },
      preHandler: authenticate,
    },
    async (req) => {
      const ctx = requireCtx(req);
      const { attendanceId } = z.object({ attendanceId: z.string().uuid() }).parse(req.params);
      const { eventId } = z.object({ eventId: z.string().uuid() }).parse(req.query);
      return ok(await getEvidenceUrl(ctx, attendanceId, eventId), req.id);
    },
  );

  const correctionBody = z.object({
    correctedOccurredAt: z.string().datetime(),
    reason: z.string().min(5).max(500),
  });

  app.post(
    '/admin/attendance/:attendanceId/correction',
    { schema: { params: z.object({ attendanceId: z.string().uuid() }), body: correctionBody }, preHandler: authorize('attendance:correct') },
    async (req) => {
      const ctx = requireCtx(req);
      const { attendanceId } = z.object({ attendanceId: z.string().uuid() }).parse(req.params);
      const body = correctionBody.parse(req.body);
      const result = await correctAttendance(ctx, attendanceId, { ...body, requestId: req.id });
      return ok(result, req.id);
    },
  );
}
