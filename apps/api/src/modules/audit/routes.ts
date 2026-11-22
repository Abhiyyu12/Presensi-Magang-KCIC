import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { getDb } from '../../infrastructure/db.js';
import { ok, paginationQuery, paginationMeta, skipTake } from '../../common/http.js';
import { parseDateOnly } from '../../common/time.js';
import { authorize } from '../../app/auth.js';

const auditListQuery = paginationQuery.extend({
  objectType: z.string().max(64).optional(),
  objectId: z.string().max(64).optional(),
  actorUserId: z.string().uuid().optional(),
  action: z.string().max(128).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal YYYY-MM-DD').optional(),
  endDateExclusive: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal YYYY-MM-DD').optional(),
});

/**
 * Audit trail is append-only and read-only: NO create/update/delete routes here.
 * Sorting is fixed to occurredAt desc.
 */
export async function auditRoutes(app: FastifyInstance): Promise<void> {
  const db = getDb();

  app.get(
    '/admin/audit',
    { schema: { querystring: auditListQuery }, preHandler: authorize('admin:audit:view') },
    async (req) => {
      const query = auditListQuery.parse(req.query);
      const where: Prisma.AuditEventWhereInput = {
        ...(query.objectType ? { objectType: query.objectType } : {}),
        ...(query.objectId ? { objectId: query.objectId } : {}),
        ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
        ...(query.action ? { action: { contains: query.action, mode: 'insensitive' } } : {}),
        ...(query.startDate || query.endDateExclusive
          ? {
              occurredAt: {
                ...(query.startDate ? { gte: parseDateOnly(query.startDate) } : {}),
                ...(query.endDateExclusive ? { lt: parseDateOnly(query.endDateExclusive) } : {}),
              },
            }
          : {}),
      };
      const [total, items] = await db.$transaction([
        db.auditEvent.count({ where }),
        db.auditEvent.findMany({
          where,
          include: { actor: { select: { id: true, username: true, displayName: true } } },
          orderBy: { occurredAt: 'desc' },
          ...skipTake(query),
        }),
      ]);
      return ok({ items, pagination: paginationMeta(query, total) }, req.id);
    },
  );
}
