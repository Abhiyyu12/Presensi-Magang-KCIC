import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { getDb } from '../../infrastructure/db.js';
import { ok } from '../../common/http.js';
import { forbidden, badRequest } from '../../common/errors.js';
import { businessDate, businessWeekday, parseDateOnly } from '../../common/time.js';
import { authenticate, requireCtx } from '../../app/auth.js';
import { hasPermission, type AccessContext } from '../access/context.js';
import { resolveWorkday } from '../schedules/service.js';

function requirePermissionCode(ctx: AccessContext, code: string): void {
  if (!hasPermission(ctx, code)) throw forbidden();
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;
const YEAR_RE = /^\d{4}$/;

const adminDashboardQuery = z.object({
  bureauId: z.string().uuid().optional(),
  divisionId: z.string().uuid().optional(),
  date: z.string().regex(DATE_RE, 'Format tanggal harus YYYY-MM-DD.').optional(),
  from: z.string().regex(DATE_RE, 'Format tanggal harus YYYY-MM-DD.').optional(),
  to: z.string().regex(DATE_RE, 'Format tanggal harus YYYY-MM-DD.').optional(),
  month: z.string().regex(MONTH_RE, 'Format bulan harus YYYY-MM.').optional(),
  year: z.string().regex(YEAR_RE, 'Format tahun harus YYYY.').optional(),
});

interface DateRange {
  from: string;
  to: string;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Normalisasi filter waktu menjadi rentang [from, to] (date-only string). */
function normalizeRange(q: z.infer<typeof adminDashboardQuery>, today: string): DateRange {
  if (q.date) return { from: q.date, to: q.date };
  if (q.month) {
    const [year, month] = q.month.split('-').map(Number) as [number, number];
    const last = lastDayOfMonth(year, month);
    return { from: `${q.month}-01`, to: `${q.month}-${String(last).padStart(2, '0')}` };
  }
  if (q.year) return { from: `${q.year}-01-01`, to: `${q.year}-12-31` };
  const from = q.from ?? q.to ?? today;
  const to = q.to ?? q.from ?? today;
  if (from > to) throw badRequest('Tanggal awal melebihi tanggal akhir.');
  return { from, to };
}

function addDays(dateOnly: string, delta: number): string {
  const d = parseDateOnly(dateOnly);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

const SERIES_MAX_DAYS = 31;

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
    const parsed = adminDashboardQuery.safeParse(req.query);
    if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'Parameter filter tidak valid.');
    const q = parsed.data;
    const today = businessDate();
    const range = normalizeRange(q, today);
    const todayDate = parseDateOnly(today);
    const fromDate = parseDateOnly(range.from);
    const toDate = parseDateOnly(range.to);

    // Filter scope organisasi: biro/divisi dari profil peserta.
    const profileFilter: Prisma.InternProfileWhereInput = {
      ...(q.bureauId ? { bureauId: q.bureauId } : {}),
      ...(q.divisionId ? { divisionId: q.divisionId } : {}),
    };

    const dayWhere: Prisma.AttendanceDayWhereInput = {
      workDate: { gte: fromDate, lte: toDate },
      internProfile: profileFilter,
    };
    const leaveWhere: Prisma.LeaveRequestWhereInput = {
      workDate: { gte: fromDate, lte: toDate },
      internProfile: profileFilter,
    };
    const snapshotWhere: Prisma.WorkdaySnapshotWhereInput = {
      workDate: { gte: fromDate, lte: toDate },
      isWorkingDay: true,
      internProfile: profileFilter,
    };

    let scheduled = await db.workdaySnapshot.count({ where: snapshotWhere });
    if (scheduled === 0 && toDate >= todayDate) {
      // Snapshot hari ini belum dibuat: hitung dari resolusi jadwal, bukan asumsi.
      const interns = await db.internProfile.findMany({
        where: { status: 'ACTIVE', ...profileFilter },
        select: { id: true },
        take: 500,
      });
      const weekday = businessWeekday(new Date());
      let resolvedCount = 0;
      for (const intern of interns) {
        const resolved = await resolveWorkday(db, intern.id, today, weekday);
        if (resolved.isWorkingDay) resolvedCount += 1;
      }
      scheduled = resolvedCount;
    }

    const [checkedIn, late, needsReview, pendingLeaves, staleLeaves] = await Promise.all([
      db.attendanceDay.count({ where: { ...dayWhere, checkInEventId: { not: null } } }),
      db.attendanceDay.count({ where: { ...dayWhere, dayStatus: 'LATE' } }),
      db.attendanceDay.count({ where: { ...dayWhere, dayStatus: 'NEEDS_REVIEW' } }),
      db.leaveRequest.count({ where: { ...leaveWhere, status: 'PENDING' } }),
      db.leaveRequest.count({ where: { ...leaveWhere, status: 'DEPARTED' } }),
    ]);

    // Seri harian untuk grafik: maksimal 31 titik terakhir dalam rentang.
    const seriesFrom = range.to > today ? today : range.to;
    const seriesStart = addDays(seriesFrom, -(SERIES_MAX_DAYS - 1));
    const effStart = seriesStart > range.from ? seriesStart : range.from;
    const [dayRows, snapshotRows] = await Promise.all([
      db.attendanceDay.findMany({
        where: {
          workDate: { gte: parseDateOnly(effStart), lte: toDate },
          internProfile: profileFilter,
        },
        select: { workDate: true, dayStatus: true, checkInEventId: true },
      }),
      db.workdaySnapshot.findMany({
        where: {
          workDate: { gte: parseDateOnly(effStart), lte: toDate },
          isWorkingDay: true,
          internProfile: profileFilter,
        },
        select: { workDate: true },
      }),
    ]);
    const dayByDate = new Map<string, { checkedIn: number; late: number; needsReview: number }>();
    for (const row of dayRows) {
      const key = row.workDate.toISOString().slice(0, 10);
      const agg = dayByDate.get(key) ?? { checkedIn: 0, late: 0, needsReview: 0 };
      if (row.checkInEventId !== null) agg.checkedIn += 1;
      if (row.dayStatus === 'LATE') agg.late += 1;
      if (row.dayStatus === 'NEEDS_REVIEW') agg.needsReview += 1;
      dayByDate.set(key, agg);
    }
    const snapByDate = new Map<string, number>();
    for (const row of snapshotRows) {
      const key = row.workDate.toISOString().slice(0, 10);
      snapByDate.set(key, (snapByDate.get(key) ?? 0) + 1);
    }
    const series: { date: string; scheduled: number; checkedIn: number; late: number; needsReview: number }[] = [];
    let cursor = effStart;
    while (cursor <= seriesFrom) {
      series.push({
        date: cursor,
        scheduled: snapByDate.get(cursor) ?? 0,
        checkedIn: dayByDate.get(cursor)?.checkedIn ?? 0,
        late: dayByDate.get(cursor)?.late ?? 0,
        needsReview: dayByDate.get(cursor)?.needsReview ?? 0,
      });
      cursor = addDays(cursor, 1);
    }

    return ok(
      {
        today,
        range,
        counts: { scheduled, checkedIn, late, needsReview, pendingLeaves, staleLeaves },
        series,
      },
      req.id,
    );
  });
}
