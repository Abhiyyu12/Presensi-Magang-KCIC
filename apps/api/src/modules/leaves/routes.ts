import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ok, paginationQuery, dateRangeQuery } from '../../common/http.js';
import { badRequest } from '../../common/errors.js';
import { getDb } from '../../infrastructure/db.js';
import { authenticate, authorize, requireCtx } from '../../app/auth.js';
import { readMultipart, requireIdempotencyKey, parseCoords } from '../../common/multipart.js';
import {
  createLeave, decideLeave, cancelLeave, submitMovement, listLeaves, getLeaveDetail,
} from './service.js';

const createBody = z.object({
  leaveType: z.enum(['TEMPORARY', 'EARLY_DEPARTURE']),
  categoryId: z.string().uuid(),
  reason: z.string().min(5).max(1000),
  estimatedDepartureAt: z.string().datetime(),
  estimatedReturnAt: z.string().datetime().nullable().optional(),
});

const listQuery = paginationQuery.merge(dateRangeQuery).extend({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'DEPARTED', 'RETURNED', 'COMPLETED', 'NEEDS_REVIEW']).optional(),
  scope: z.enum(['mine', 'all']).optional(),
});

const idParams = z.object({ leaveId: z.string().uuid() });

const decideBody = z.object({ note: z.string().max(1000).optional() });
const rejectBody = z.object({ note: z.string().min(3).max(1000) });

function movementHandler(movementType: 'DEPARTURE' | 'RETURN' | 'EARLY_CHECKOUT') {
  return async (req: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => {
    const ctx = requireCtx(req);
    const { leaveId } = idParams.parse(req.params);
    const idempotencyKey = requireIdempotencyKey(req);
    const { fields, file } = await readMultipart(req);
    if (!file) throw badRequest('Selfie wajib diambil dari kamera untuk pergerakan izin.');
    const { latitude, longitude, accuracyMeters } = parseCoords(fields);
    const result = await submitMovement(ctx, leaveId, movementType, {
      latitude, longitude, accuracyMeters, idempotencyKey,
      imageBuffer: file.buffer, imageMime: file.mimetype,
    }, req.id);
    reply.code(201);
    return ok(result, req.id);
  };
}

export async function leaveRoutes(app: FastifyInstance): Promise<void> {
  app.get('/leaves', { schema: { querystring: listQuery }, preHandler: authenticate }, async (req) => {
    const ctx = requireCtx(req);
    const q = listQuery.parse(req.query);
    const { items, total } = await listLeaves(ctx, q);
    return ok({ items, pagination: { page: q.page, pageSize: q.pageSize, total, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) } }, req.id);
  });

  app.post('/leaves', { schema: { body: createBody }, preHandler: authorize('leave:request') }, async (req, reply) => {
    const ctx = requireCtx(req);
    const body = createBody.parse(req.body);
    const leave = await createLeave(ctx, body, req.id);
    reply.code(201);
    return ok({ id: leave.id, status: leave.status }, req.id);
  });

  // Applicant-facing read list: the admin CRUD endpoint is not readable by peserta.
  app.get('/leaves/categories', { preHandler: authorize('leave:request') }, async (req) => {
    const items = await getDb().leaveCategory.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, code: true, name: true },
    });
    return ok({ items }, req.id);
  });

  app.get('/leaves/:leaveId', { schema: { params: idParams }, preHandler: authenticate }, async (req) => {
    const ctx = requireCtx(req);
    const { leaveId } = idParams.parse(req.params);
    return ok(await getLeaveDetail(ctx, leaveId), req.id);
  });

  app.post('/leaves/:leaveId/cancel', { schema: { params: idParams }, preHandler: authenticate }, async (req) => {
    const ctx = requireCtx(req);
    const { leaveId } = idParams.parse(req.params);
    const leave = await cancelLeave(ctx, leaveId, req.id);
    return ok({ id: leave.id, status: leave.status }, req.id);
  });

  app.post('/leaves/:leaveId/approve', { schema: { params: idParams, body: decideBody }, preHandler: authorize('leave:approve') }, async (req) => {
    const ctx = requireCtx(req);
    const { leaveId } = idParams.parse(req.params);
    const { note } = decideBody.parse(req.body ?? {});
    const leave = await decideLeave(ctx, leaveId, 'approve', note, req.id);
    return ok({ id: leave.id, status: leave.status }, req.id);
  });

  app.post('/leaves/:leaveId/reject', { schema: { params: idParams, body: rejectBody }, preHandler: authorize('leave:approve') }, async (req) => {
    const ctx = requireCtx(req);
    const { leaveId } = idParams.parse(req.params);
    const { note } = rejectBody.parse(req.body);
    const leave = await decideLeave(ctx, leaveId, 'reject', note, req.id);
    return ok({ id: leave.id, status: leave.status }, req.id);
  });

  app.post('/leaves/:leaveId/departure', { schema: { params: idParams }, preHandler: authenticate }, movementHandler('DEPARTURE'));
  app.post('/leaves/:leaveId/return', { schema: { params: idParams }, preHandler: authenticate }, movementHandler('RETURN'));
  app.post('/leaves/:leaveId/early-checkout', { schema: { params: idParams }, preHandler: authenticate }, movementHandler('EARLY_CHECKOUT'));
}
