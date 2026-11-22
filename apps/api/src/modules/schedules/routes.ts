import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { getDb } from '../../infrastructure/db.js';
import { ok, paginationQuery, paginationMeta, skipTake } from '../../common/http.js';
import { badRequest, forbidden, notFound, unprocessable } from '../../common/errors.js';
import { writeAudit } from '../../common/audit.js';
import { parseDateOnly } from '../../common/time.js';
import { authenticate, authorize, requireCtx } from '../../app/auth.js';
import { hasPermission } from '../access/context.js';
import { getNumberParam, getNumberArrayParam } from '../../common/params.js';
import { assertNoScheduleConflict } from './service.js';

const idParams = z.object({ id: z.string().uuid() });
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal YYYY-MM-DD');
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Format jam HH:mm');
const scopeTypeSchema = z.enum(['GLOBAL', 'BUREAU', 'DIVISION', 'INDIVIDUAL']);
const genericStatus = z.enum(['ACTIVE', 'INACTIVE']);

const scheduleDaySchema = z.object({
  weekday: z.number().int().min(1).max(7),
  isWorkingDay: z.boolean(),
  startTime: hhmm.optional(),
  endTime: hhmm.optional(),
  lateToleranceMinutes: z.number().int().min(0).max(240).optional(),
});

const scheduleCreateBody = z.object({
  name: z.string().min(1).max(128),
  scopeType: scopeTypeSchema,
  scopeId: z.string().uuid().optional(),
  validFrom: dateOnly,
  validTo: dateOnly.optional(),
  days: z.array(scheduleDaySchema).min(1).max(7),
});

const schedulePatchBody = z.object({
  name: z.string().min(1).max(128).optional(),
  status: genericStatus.optional(),
  validTo: dateOnly.nullable().optional(),
  days: z.array(scheduleDaySchema).min(1).max(7).optional(),
});

const scheduleListQuery = paginationQuery.extend({ scopeType: scopeTypeSchema.optional() });

const calendarCreateBody = z.object({
  calendarDate: dateOnly,
  dayType: z.enum(['NORMAL', 'HOLIDAY', 'WORKING_EXCEPTION']),
  name: z.string().max(128).optional(),
  source: z.string().max(64).optional(),
  status: genericStatus.optional(),
});

const calendarPatchBody = z.object({
  dayType: z.enum(['NORMAL', 'HOLIDAY', 'WORKING_EXCEPTION']).optional(),
  name: z.string().max(128).nullable().optional(),
  source: z.string().max(64).nullable().optional(),
  status: genericStatus.optional(),
});

const calendarListQuery = paginationQuery.extend({
  startDate: dateOnly.optional(),
  endDateExclusive: dateOnly.optional(),
});

function validateScopeId(scopeType: z.infer<typeof scopeTypeSchema>, scopeId: string | undefined): void {
  if (scopeType !== 'GLOBAL' && !scopeId) {
    throw badRequest('scopeId wajib diisi untuk scope BUREAU, DIVISION, atau INDIVIDUAL.');
  }
}

function validateDays(days: z.infer<typeof scheduleDaySchema>[]): void {
  const seen = new Set<number>();
  for (const day of days) {
    if (seen.has(day.weekday)) throw unprocessable('Terdapat duplikasi weekday pada days.');
    seen.add(day.weekday);
    if (day.isWorkingDay) {
      if (!day.startTime || !day.endTime) {
        throw unprocessable('startTime dan endTime wajib diisi untuk hari kerja.');
      }
      if (day.startTime >= day.endTime) {
        throw unprocessable('startTime harus lebih kecil dari endTime.');
      }
    }
  }
}

function requireReadAccess(req: Parameters<typeof requireCtx>[0]): void {
  const ctx = requireCtx(req);
  if (!hasPermission(ctx, 'admin:schedules:manage') && !hasPermission(ctx, 'report:view')) {
    throw forbidden();
  }
}

export async function scheduleRoutes(app: FastifyInstance): Promise<void> {
  const db = getDb();

  app.post(
    '/admin/schedules',
    { schema: { body: scheduleCreateBody }, preHandler: authorize('admin:schedules:manage') },
    async (req) => {
      const ctx = requireCtx(req);
      const body = scheduleCreateBody.parse(req.body);
      validateScopeId(body.scopeType, body.scopeId);
      validateDays(body.days);
      const validFrom = parseDateOnly(body.validFrom);
      const validTo = body.validTo ? parseDateOnly(body.validTo) : null;
      if (validTo && validTo <= validFrom) throw unprocessable('validTo harus setelah validFrom.');
      await assertNoScheduleConflict(db, body.scopeType, body.scopeId ?? null, validFrom, validTo);
      const defaultTolerance = await getNumberParam(db, 'late_tolerance_default_minutes');
      const schedule = await db.$transaction(async (tx) => {
        const created = await tx.workSchedule.create({
          data: {
            name: body.name,
            scopeType: body.scopeType,
            scopeId: body.scopeType === 'GLOBAL' ? null : body.scopeId,
            validFrom,
            validTo,
          },
        });
        await tx.workScheduleDay.createMany({
          data: body.days.map((d) => {
            const tolerance = d.lateToleranceMinutes ?? defaultTolerance;
            return {
              scheduleId: created.id,
              weekday: d.weekday,
              isWorkingDay: d.isWorkingDay,
              startTime: d.startTime ?? null,
              endTime: d.endTime ?? null,
              // Without a value, the DB column default applies (last resort).
              ...(tolerance != null ? { lateToleranceMinutes: tolerance } : {}),
            };
          }),
        });
        await writeAudit(tx as never, {
          actorUserId: ctx.user.id,
          action: 'ADMIN_SCHEDULE_CREATE',
          objectType: 'workSchedule',
          objectId: created.id,
          after: { ...created, days: body.days },
          requestId: req.id,
        });
        return created;
      });
      const full = await db.workSchedule.findUnique({ where: { id: schedule.id }, include: { days: true } });
      return ok(full, req.id);
    },
  );

  app.get(
    '/admin/schedules',
    { schema: { querystring: scheduleListQuery }, preHandler: authenticate },
    async (req) => {
      requireReadAccess(req);
      const query = scheduleListQuery.parse(req.query);
      const where: Prisma.WorkScheduleWhereInput = { ...(query.scopeType ? { scopeType: query.scopeType } : {}) };
      const [total, items] = await db.$transaction([
        db.workSchedule.count({ where }),
        db.workSchedule.findMany({ where, orderBy: { validFrom: 'desc' }, ...skipTake(query) }),
      ]);
      return ok({ items, pagination: paginationMeta(query, total) }, req.id);
    },
  );

  // Form defaults from business parameters (no hardcoded policy in clients).
  app.get(
    '/admin/schedules/form-defaults',
    { preHandler: authorize('admin:schedules:manage') },
    async (req) => {
      const [defaultWorkdays, lateToleranceDefaultMinutes] = await Promise.all([
        getNumberArrayParam(db, 'default_workdays'),
        getNumberParam(db, 'late_tolerance_default_minutes'),
      ]);
      return ok({ defaultWorkdays, lateToleranceDefaultMinutes }, req.id);
    },
  );

  app.get(
    '/admin/schedules/:id',
    { schema: { params: idParams }, preHandler: authenticate },
    async (req) => {
      requireReadAccess(req);
      const { id } = idParams.parse(req.params);
      const schedule = await db.workSchedule.findUnique({
        where: { id },
        include: { days: { orderBy: { weekday: 'asc' } } },
      });
      if (!schedule) throw notFound();
      return ok(schedule, req.id);
    },
  );

  app.patch(
    '/admin/schedules/:id',
    { schema: { params: idParams, body: schedulePatchBody }, preHandler: authorize('admin:schedules:manage') },
    async (req) => {
      const ctx = requireCtx(req);
      const { id } = idParams.parse(req.params);
      const body = schedulePatchBody.parse(req.body);
      const before = await db.workSchedule.findUnique({ where: { id }, include: { days: true } });
      if (!before) throw notFound();
      if (body.days) validateDays(body.days);
      const nextValidTo =
        body.validTo === undefined ? before.validTo : body.validTo === null ? null : parseDateOnly(body.validTo);
      const validityChanges = body.status !== undefined || body.validTo !== undefined;
      if (validityChanges || nextValidTo?.getTime() !== before.validTo?.getTime()) {
        await assertNoScheduleConflict(db, before.scopeType, before.scopeId, before.validFrom, nextValidTo, id);
      }
      if (nextValidTo && nextValidTo <= before.validFrom) throw unprocessable('validTo harus setelah validFrom.');
      const updated = await db.$transaction(async (tx) => {
        await tx.workSchedule.update({
          where: { id },
          data: {
            ...(body.name !== undefined ? { name: body.name } : {}),
            ...(body.status !== undefined ? { status: body.status } : {}),
            ...(body.validTo !== undefined ? { validTo: nextValidTo } : {}),
            version: { increment: 1 },
          },
        });
        if (body.days) {
          const defaultTolerance = await getNumberParam(tx, 'late_tolerance_default_minutes');
          await tx.workScheduleDay.deleteMany({ where: { scheduleId: id } });
          await tx.workScheduleDay.createMany({
            data: body.days.map((d) => {
              const tolerance = d.lateToleranceMinutes ?? defaultTolerance;
              return {
                scheduleId: id,
                weekday: d.weekday,
                isWorkingDay: d.isWorkingDay,
                startTime: d.startTime ?? null,
                endTime: d.endTime ?? null,
                ...(tolerance != null ? { lateToleranceMinutes: tolerance } : {}),
              };
            }),
          });
        }
        const after = await tx.workSchedule.findUnique({ where: { id }, include: { days: true } });
        await writeAudit(tx as never, {
          actorUserId: ctx.user.id,
          action: 'ADMIN_SCHEDULE_UPDATE',
          objectType: 'workSchedule',
          objectId: id,
          before,
          after,
          requestId: req.id,
        });
        return after;
      });
      return ok(updated, req.id);
    },
  );

  // ---------- Calendar ----------

  app.post(
    '/admin/calendar',
    { schema: { body: calendarCreateBody }, preHandler: authorize('admin:calendar:manage') },
    async (req) => {
      const ctx = requireCtx(req);
      const body = calendarCreateBody.parse(req.body);
      const calendarDate = parseDateOnly(body.calendarDate);
      const before = await db.calendarDay.findUnique({ where: { calendarDate } });
      const day = await db.calendarDay.upsert({
        where: { calendarDate },
        create: {
          calendarDate,
          dayType: body.dayType,
          name: body.name,
          source: body.source,
          status: body.status ?? 'ACTIVE',
        },
        update: {
          dayType: body.dayType,
          name: body.name,
          source: body.source,
          ...(body.status !== undefined ? { status: body.status } : {}),
        },
      });
      await writeAudit(db, {
        actorUserId: ctx.user.id,
        action: before ? 'ADMIN_CALENDAR_UPDATE' : 'ADMIN_CALENDAR_CREATE',
        objectType: 'calendarDay',
        objectId: day.id,
        before: before ?? undefined,
        after: day,
        requestId: req.id,
      });
      return ok(day, req.id);
    },
  );

  app.get(
    '/admin/calendar',
    { schema: { querystring: calendarListQuery }, preHandler: authenticate },
    async (req) => {
      const ctx = requireCtx(req);
      if (
        !hasPermission(ctx, 'admin:calendar:manage') &&
        !hasPermission(ctx, 'admin:schedules:manage') &&
        !hasPermission(ctx, 'report:view')
      ) {
        throw forbidden();
      }
      const query = calendarListQuery.parse(req.query);
      const where: Prisma.CalendarDayWhereInput = {
        ...(query.startDate || query.endDateExclusive
          ? {
              calendarDate: {
                ...(query.startDate ? { gte: parseDateOnly(query.startDate) } : {}),
                ...(query.endDateExclusive ? { lt: parseDateOnly(query.endDateExclusive) } : {}),
              },
            }
          : {}),
      };
      const items = await db.calendarDay.findMany({
        where,
        orderBy: { calendarDate: 'asc' },
        ...skipTake(query),
      });
      const total = await db.calendarDay.count({ where });
      return ok({ items, pagination: paginationMeta(query, total) }, req.id);
    },
  );

  app.patch(
    '/admin/calendar/:id',
    { schema: { params: idParams, body: calendarPatchBody }, preHandler: authorize('admin:calendar:manage') },
    async (req) => {
      const ctx = requireCtx(req);
      const { id } = idParams.parse(req.params);
      const body = calendarPatchBody.parse(req.body);
      const before = await db.calendarDay.findUnique({ where: { id } });
      if (!before) throw notFound();
      const day = await db.calendarDay.update({ where: { id }, data: body });
      await writeAudit(db, {
        actorUserId: ctx.user.id,
        action: 'ADMIN_CALENDAR_UPDATE',
        objectType: 'calendarDay',
        objectId: id,
        before,
        after: day,
        requestId: req.id,
      });
      return ok(day, req.id);
    },
  );
}
