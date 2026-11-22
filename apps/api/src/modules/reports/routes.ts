import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ok, paginationQuery, dateRangeQuery } from '../../common/http.js';
import { badRequest } from '../../common/errors.js';
import { authorize, requireCtx } from '../../app/auth.js';
import { buildReportRows, computeMetrics, rowsToCsv, rowsToXlsx, auditExport } from './service.js';

const reportQuery = paginationQuery.merge(dateRangeQuery.extend({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDateExclusive: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})).extend({
  internProfileId: z.string().uuid().optional(),
  bureauId: z.string().uuid().optional(),
  divisionId: z.string().uuid().optional(),
  dayStatus: z.enum(['NOT_SCHEDULED', 'SCHEDULED', 'PRESENT', 'LATE', 'INCOMPLETE', 'NEEDS_REVIEW', 'EARLY_DEPARTURE_APPROVED']).optional(),
});

const MAX_EXPORT_ROWS = 20000;

export async function reportRoutes(app: FastifyInstance): Promise<void> {
  app.get('/reports/attendance', { schema: { querystring: reportQuery }, preHandler: authorize('report:view') }, async (req) => {
    const ctx = requireCtx(req);
    const q = reportQuery.parse(req.query);
    const rows = await buildReportRows(ctx, q);
    const metrics = computeMetrics(rows);
    const start = (q.page - 1) * q.pageSize;
    const items = rows.slice(start, start + q.pageSize);
    return ok(
      { items, metrics, pagination: { page: q.page, pageSize: q.pageSize, total: rows.length, totalPages: Math.max(1, Math.ceil(rows.length / q.pageSize)) } },
      req.id,
    );
  });

  app.get('/reports/statistics', { schema: { querystring: reportQuery }, preHandler: authorize('report:view') }, async (req) => {
    const ctx = requireCtx(req);
    const q = reportQuery.parse(req.query);
    const rows = await buildReportRows(ctx, q);
    return ok({ metrics: computeMetrics(rows), rowCount: rows.length }, req.id);
  });

  const exportQuery = reportQuery.extend({ format: z.enum(['csv', 'xlsx']) });

  app.get('/reports/attendance/export', { schema: { querystring: exportQuery }, preHandler: authorize('report:export') }, async (req, reply) => {
    const ctx = requireCtx(req);
    const q = exportQuery.parse(req.query);
    const rows = await buildReportRows(ctx, { ...q, page: 1, pageSize: MAX_EXPORT_ROWS });
    if (rows.length > MAX_EXPORT_ROWS) throw badRequest(`Ekspor dibatasi maksimal ${MAX_EXPORT_ROWS} baris. Persempit filter.`);
    await auditExport(ctx, q.format, rows.length, q);
    const stamp = new Date().toISOString().slice(0, 10);
    if (q.format === 'csv') {
      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="attendance-${stamp}.csv"`);
      return reply.send(rowsToCsv(rows));
    }
    const buf = await rowsToXlsx(rows);
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('Content-Disposition', `attachment; filename="attendance-${stamp}.xlsx"`);
    return reply.send(buf);
  });
}
