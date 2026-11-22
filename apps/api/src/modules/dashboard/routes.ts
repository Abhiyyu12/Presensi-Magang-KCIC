import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { getDb } from '../../infrastructure/db.js';
import { ok } from '../../common/http.js';
import { forbidden } from '../../common/errors.js';
import { businessDate, businessWeekday, parseDateOnly } from '../../common/time.js';
import { authenticate, requireCtx } from '../../app/auth.js';
import { hasPermission, type AccessContext } from '../access/context.js';
import { resolveWorkday } from '../schedules/service.js';

function requirePermissionCode(ctx: AccessContext, code: string): void {
  if (!hasPermission(ctx, code)) throw forbidden();
}

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  const db = getDb();

  // ---------- Participant dashboard ----------

  app.get('/dashboard/participant', { preHandler: authenticate }, async (req) => {
    const ctx = requireCtx(req);
    requirePermissionCode(ctx, 'dashboard:view');
    if (!ctx.internProfileId) throw forbidden('Dashboard peserta hanya untuk pengguna dengan profil peserta.');
    const internProfileId = ctx.internProfileId;
    const today = businessDate();
    const todayDate = parseDateOnly(today);

    const [workday, attendanceDay, activeLeave, myLeavePending] = await Promise.all([
      db.workdaySnapshot.findUnique({
        where: { internProfileId_workDate: { internProfileId, workDate: todayDate } },
      }),
      db.attendanceDay.findUnique({
        where: { internProfileId_workDate: { internProfileId, workDate: todayDate } },
        include: { events: { orderBy: { occurredAtServer: 'asc' } } },
      }),
      db.leaveRequest.findFirst({
        where: {
          internProfileId,
          workDate: todayDate,
          status: { in: ['PENDING', 'APPROVED', 'DEPARTED', 'RETURNED'] },
        },
        orderBy: { requestedAt: 'desc' },
        include: { category: { select: { id: true, code: true, name: true } } },
      }),
      db.leaveRequest.count({ where: { internProfileId, status: 'PENDING' } }),
    ]);

    return ok(
      {
        today,
        workday: workday ?? { isWorkingDay: false, resolutionSource: 'NONE' },
        attendanceDay,
        activeLeave,
        pendingCounts: { myLeavePending },
      },
      req.id,
    );
  });

  // ---------- Supervisor dashboard ----------

  app.get('/dashboard/supervisor', { preHandler: authenticate }, async (req) => {
    const ctx = requireCtx(req);
    requirePermissionCode(ctx, 'attendance:view:scoped');
    const today = businessDate();
    const todayDate = parseDateOnly(today);
    const now = new Date();

    const assignments = await db.supervisorAssignment.findMany({
      where: {
        supervisorUserId: ctx.user.id,
        status: 'ACTIVE',
        validFrom: { lte: now },
        OR: [{ validTo: null }, { validTo: { gte: now } }],
      },
      select: {
        internProfileId: true,
        internProfile: {
          select: {
            id: true,
            participantNumber: true,
            user: { select: { id: true, displayName: true } },
          },
        },
      },
    });
    const assignedIds = assignments.map((a) => a.internProfileId);

    let checkedIn = 0;
    let needsReview = 0;
    let pendingLeaves = 0;
    const statusByIntern = new Map<string, string>();
    const workingByIntern = new Map<string, boolean>();
    if (assignedIds.length > 0) {
      const whereToday: Prisma.AttendanceDayWhereInput = {
        workDate: todayDate,
        internProfileId: { in: assignedIds },
      };
      const [days, reviewCount, pendingCount, snapshots] = await Promise.all([
        db.attendanceDay.findMany({
          where: whereToday,
          select: {
            internProfileId: true,
            dayStatus: true,
            events: { where: { eventType: 'CHECK_IN', status: { not: 'VOIDED' } }, select: { id: true } },
          },
        }),
        db.attendanceDay.count({ where: { ...whereToday, dayStatus: 'NEEDS_REVIEW' } }),
        db.leaveRequest.count({ where: { internProfileId: { in: assignedIds }, status: 'PENDING' } }),
        db.workdaySnapshot.findMany({
          where: { workDate: todayDate, internProfileId: { in: assignedIds } },
          select: { internProfileId: true, isWorkingDay: true },
        }),
      ]);
      checkedIn = new Set(days.filter((d) => d.events.length > 0).map((d) => d.internProfileId)).size;
      needsReview = reviewCount;
      pendingLeaves = pendingCount;
      for (const d of days) statusByIntern.set(d.internProfileId, d.dayStatus);
      for (const s of snapshots) workingByIntern.set(s.internProfileId, s.isWorkingDay);
    }

    return ok(
      {
        today,
        assignedInterns: {
          count: assignedIds.length,
          items: assignments.map((a) => a.internProfile),
        },
        todayStats: {
          checkedIn,
          notCheckedIn: Math.max(0, assignedIds.length - checkedIn),
          needsReview,
          pendingLeaves,
        },
        todayStatus: assignments.map((a) => ({
          name: a.internProfile.user.displayName,
          dayStatus:
            statusByIntern.get(a.internProfileId) ??
            (workingByIntern.get(a.internProfileId) ? 'SCHEDULED' : 'NOT_SCHEDULED'),
        })),
      },
      req.id,
    );
  });

  // ---------- Admin dashboard ----------

  app.get('/dashboard/admin', { preHandler: authenticate }, async (req) => {
    const ctx = requireCtx(req);
    if (
      !hasPermission(ctx, 'leave:approve') &&
      !hasPermission(ctx, 'admin:audit:view') &&
      !hasPermission(ctx, 'report:view')
    ) {
      throw forbidden();
    }
    const today = businessDate();
    const todayDate = parseDateOnly(today);

    const snapshotCount = await db.workdaySnapshot.count({ where: { workDate: todayDate, isWorkingDay: true } });
    let scheduled = snapshotCount;
    if (snapshotCount === 0) {
      // No snapshots yet today: resolve schedules instead of assuming all interns are scheduled.
      const interns = await db.internProfile.findMany({ where: { status: 'ACTIVE' }, select: { id: true }, take: 500 });
      const weekday = businessWeekday(new Date());
      let resolvedCount = 0;
      for (const intern of interns) {
        const resolved = await resolveWorkday(db, intern.id, today, weekday);
        if (resolved.isWorkingDay) resolvedCount += 1;
      }
      scheduled = resolvedCount;
    }

    const [checkedIn, late, needsReview, pendingLeaves, staleLeaves] = await Promise.all([
      db.attendanceDay.count({
        where: { workDate: todayDate, checkInEventId: { not: null } },
      }),
      db.attendanceDay.count({ where: { workDate: todayDate, dayStatus: 'LATE' } }),
      db.attendanceDay.count({ where: { workDate: todayDate, dayStatus: 'NEEDS_REVIEW' } }),
      db.leaveRequest.count({ where: { status: 'PENDING' } }),
      db.leaveRequest.count({ where: { status: 'DEPARTED', workDate: { lt: todayDate } } }),
    ]);

    return ok(
      {
        today,
        counts: { scheduled, checkedIn, late, needsReview, pendingLeaves, staleLeaves },
      },
      req.id,
    );
  });
}
