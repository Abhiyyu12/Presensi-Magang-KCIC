import type { PrismaClient } from '@prisma/client';
import { getDb } from '../../infrastructure/db.js';
import { badRequest } from '../../common/errors.js';
import { writeAudit } from '../../common/audit.js';
import { businessDate, businessWeekday, businessHHmm, addDays, parseDateOnly } from '../../common/time.js';
import { getOrCreateSnapshot } from '../schedules/service.js';
import { sweepStaleTemporaryLeaves } from '../attendance/service.js';
import type { AccessContext } from '../access/context.js';
import { requirePermission, internScopeWhere } from '../access/scope.js';
import ExcelJS from 'exceljs';

export interface ReportQuery {
  startDate: string;
  endDateExclusive: string;
  internProfileId?: string;
  bureauId?: string;
  divisionId?: string;
  dayStatus?: string;
  page: number;
  pageSize: number;
}

export interface ReportRow {
  workDate: string;
  internProfileId: string;
  participantNumber: string;
  participantName: string;
  bureau: string;
  division: string | null;
  checkIn: string | null;
  checkOut: string | null;
  dayStatus: string;
  correctionFlag: boolean;
  leaves: { leaveType: string; status: string; durationMinutes: number | null }[];
}

const MAX_RANGE_DAYS = 62;

/**
 * Report base: scheduled participants always appear even without events.
 * Rows are derived from workday snapshots (created on demand) LEFT JOIN attendance.
 */
export async function buildReportRows(ctx: AccessContext, q: ReportQuery): Promise<ReportRow[]> {
  requirePermission(ctx, 'report:view');
  const db = getDb();
  await sweepStaleTemporaryLeaves(db);

  const start = q.startDate;
  const end = q.endDateExclusive;
  if (!start || !end) throw badRequest('startDate dan endDateExclusive wajib diisi.');
  if (end <= start) throw badRequest('endDateExclusive harus setelah startDate.');
  let days = 0;
  for (let d = start; d < end; d = addDays(d, 1)) {
    days += 1;
    if (days > MAX_RANGE_DAYS) throw badRequest(`Rentang tanggal maksimal ${MAX_RANGE_DAYS} hari.`);
  }

  let scopeWhere = await internScopeWhere(db, ctx);
  if (q.internProfileId) scopeWhere = { AND: [scopeWhere, { id: q.internProfileId }] };
  if (q.bureauId) scopeWhere = { AND: [scopeWhere, { bureauId: q.bureauId }] };
  if (q.divisionId) scopeWhere = { AND: [scopeWhere, { divisionId: q.divisionId }] };

  const profiles = await db.internProfile.findMany({
    where: { AND: [scopeWhere, { status: 'ACTIVE' }] },
    include: { user: { select: { displayName: true } }, bureau: true, division: true },
    orderBy: { participantNumber: 'asc' },
  });
  if (profiles.length === 0) return [];

  const dates: string[] = [];
  for (let d = start; d < end; d = addDays(d, 1)) dates.push(d);

  // Existing snapshots in range (one query); resolve missing ones per profile/date.
  const existingSnapshots = await db.workdaySnapshot.findMany({
    where: {
      internProfileId: { in: profiles.map((p) => p.id) },
      workDate: { gte: parseDateOnly(start), lt: parseDateOnly(end) },
    },
  });
  const snapMap = new Map(existingSnapshots.map((s) => [`${s.internProfileId}|${s.workDate.toISOString().slice(0, 10)}`, s]));
  for (const dateStr of dates) {
    const wd = businessWeekday(parseDateOnly(dateStr));
    // weekday from date-only is timezone-neutral enough for snapshot resolution
    for (const p of profiles) {
      const key = `${p.id}|${dateStr}`;
      if (!snapMap.has(key)) {
        const resolved = await getOrCreateSnapshot(db, p.id, dateStr, wd);
        snapMap.set(key, {
          internProfileId: p.id,
          workDate: parseDateOnly(dateStr),
          isWorkingDay: resolved.isWorkingDay,
        } as (typeof existingSnapshots)[number]);
      }
    }
  }

  const attDays = await db.attendanceDay.findMany({
    where: {
      internProfileId: { in: profiles.map((p) => p.id) },
      workDate: { gte: parseDateOnly(start), lt: parseDateOnly(end) },
    },
    include: { events: { orderBy: { occurredAtServer: 'asc' } } },
  });
  const attMap = new Map(attDays.map((d) => [`${d.internProfileId}|${d.workDate.toISOString().slice(0, 10)}`, d]));

  const leaves = await db.leaveRequest.findMany({
    where: {
      internProfileId: { in: profiles.map((p) => p.id) },
      workDate: { gte: parseDateOnly(start), lt: parseDateOnly(end) },
    },
    include: { events: true },
  });
  const leaveMap = new Map<string, typeof leaves>();
  for (const l of leaves) {
    const key = `${l.internProfileId}|${l.workDate.toISOString().slice(0, 10)}`;
    const arr = leaveMap.get(key) ?? [];
    arr.push(l);
    leaveMap.set(key, arr);
  }

  const rows: ReportRow[] = [];
  for (const dateStr of dates) {
    for (const p of profiles) {
      const key = `${p.id}|${dateStr}`;
      const snap = snapMap.get(key);
      const att = attMap.get(key);
      const dayLeaves = leaveMap.get(key) ?? [];
      const scheduled = snap?.isWorkingDay ?? false;
      // Scheduled participants always appear; unscheduled days appear only if there is data.
      if (!scheduled && !att && dayLeaves.length === 0) continue;
      const checkIn = att?.events.find((e) => e.eventType === 'CHECK_IN' && e.status !== 'VOIDED');
      const checkOut = att?.events.find((e) => e.eventType === 'CHECK_OUT' && e.status !== 'VOIDED');
      rows.push({
        workDate: dateStr,
        internProfileId: p.id,
        participantNumber: p.participantNumber,
        participantName: p.user.displayName,
        bureau: p.bureau.name,
        division: p.division?.name ?? null,
        checkIn: checkIn ? businessHHmm(checkIn.occurredAtServer) : null,
        checkOut: checkOut ? businessHHmm(checkOut.occurredAtServer) : null,
        dayStatus: att ? att.dayStatus : scheduled ? (checkIn ? 'PRESENT' : 'SCHEDULED') : 'NOT_SCHEDULED',
        correctionFlag: att?.correctionFlag ?? false,
        leaves: dayLeaves.map((l) => {
          const dep = l.events.find((e) => e.eventType === 'DEPARTURE');
          const ret = l.events.find((e) => e.eventType === 'RETURN');
          return {
            leaveType: l.leaveType,
            status: l.status,
            durationMinutes: dep && ret ? Math.round((ret.occurredAtServer.getTime() - dep.occurredAtServer.getTime()) / 60000) : null,
          };
        }),
      });
    }
  }

  if (q.dayStatus) return rows.filter((r) => r.dayStatus === q.dayStatus);
  return rows;
}

export interface ReportMetrics {
  terjadwal: number;
  hadir: number;
  tepatWaktu: number;
  terlambat: number;
  lengkap: number;
  belumLengkap: number;
  tidakAdaCatatan: number;
  izinPending: number;
  sedangIzin: number;
  sudahKembali: number;
  perluReview: number;
  pulangAwal: number;
  koreksi: number;
}

/**
 * Metrics computed from report rows (database-derived, scoped).
 * Categories are exclusive per (participant, date) row to avoid double counting:
 * hadir = has check-in; tepatWaktu/terlambat partition hadir;
 * lengkap/belumLengkap partition hadir by check-out presence;
 * tidakAdaCatatan = scheduled without check-in and without leave.
 * Denominator for rates = terjadwal.
 */
export function computeMetrics(rows: ReportRow[]): ReportMetrics {
  const m: ReportMetrics = {
    terjadwal: 0, hadir: 0, tepatWaktu: 0, terlambat: 0, lengkap: 0, belumLengkap: 0,
    tidakAdaCatatan: 0, izinPending: 0, sedangIzin: 0, sudahKembali: 0, perluReview: 0,
    pulangAwal: 0, koreksi: 0,
  };
  for (const r of rows) {
    const scheduled = r.dayStatus !== 'NOT_SCHEDULED';
    if (scheduled) m.terjadwal += 1;
    const hasLeave = r.leaves.length > 0;
    if (r.checkIn) {
      m.hadir += 1;
      if (r.dayStatus === 'LATE') m.terlambat += 1;
      else m.tepatWaktu += 1;
      if (r.checkOut) m.lengkap += 1;
      else m.belumLengkap += 1;
    } else if (scheduled && !hasLeave) {
      m.tidakAdaCatatan += 1;
    }
    for (const l of r.leaves) {
      if (l.status === 'PENDING') m.izinPending += 1;
      else if (l.status === 'DEPARTED') m.sedangIzin += 1;
      else if (l.status === 'RETURNED' || l.status === 'COMPLETED') m.sudahKembali += 1;
    }
    if (r.dayStatus === 'NEEDS_REVIEW') m.perluReview += 1;
    if (r.dayStatus === 'EARLY_DEPARTURE_APPROVED') m.pulangAwal += 1;
    if (r.correctionFlag) m.koreksi += 1;
  }
  return m;
}

/** CSV/XLSX export follows the same filter+scope as the list. No photos, no coordinates. */
export function rowsToCsv(rows: ReportRow[]): string {
  const header = ['Tanggal', 'Nomor ID', 'Nama', 'Biro', 'Divisi', 'Check-in (WIB)', 'Check-out (WIB)', 'Status', 'Izin', 'Durasi Izin (menit)', 'Koreksi'];
  const esc = (v: string | number | null | boolean) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header.join(',')];
  for (const r of rows) {
    const izin = r.leaves.map((l) => `${l.leaveType}:${l.status}`).join(' | ');
    const dur = r.leaves.map((l) => (l.durationMinutes !== null ? String(l.durationMinutes) : '-')).join(' | ');
    lines.push([
      esc(r.workDate), esc(r.participantNumber), esc(r.participantName), esc(r.bureau), esc(r.division),
      esc(r.checkIn), esc(r.checkOut), esc(r.dayStatus), esc(izin), esc(dur), esc(r.correctionFlag ? 'YA' : 'TIDAK'),
    ].join(','));
  }
  return lines.join('\n');
}

export async function rowsToXlsx(rows: ReportRow[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Attendance');
  ws.columns = [
    { header: 'Tanggal', key: 'workDate', width: 12 },
    { header: 'Nomor ID', key: 'participantNumber', width: 16 },
    { header: 'Nama', key: 'participantName', width: 28 },
    { header: 'Biro', key: 'bureau', width: 24 },
    { header: 'Divisi', key: 'division', width: 24 },
    { header: 'Check-in (WIB)', key: 'checkIn', width: 14 },
    { header: 'Check-out (WIB)', key: 'checkOut', width: 14 },
    { header: 'Status', key: 'dayStatus', width: 22 },
    { header: 'Izin', key: 'leaves', width: 30 },
    { header: 'Durasi Izin (menit)', key: 'dur', width: 18 },
    { header: 'Koreksi', key: 'correction', width: 10 },
  ];
  for (const r of rows) {
    ws.addRow({
      workDate: r.workDate,
      participantNumber: r.participantNumber,
      participantName: r.participantName,
      bureau: r.bureau,
      division: r.division ?? '',
      checkIn: r.checkIn ?? '',
      checkOut: r.checkOut ?? '',
      dayStatus: r.dayStatus,
      leaves: r.leaves.map((l) => `${l.leaveType}:${l.status}`).join(' | '),
      dur: r.leaves.map((l) => (l.durationMinutes !== null ? String(l.durationMinutes) : '-')).join(' | '),
      correction: r.correctionFlag ? 'YA' : 'TIDAK',
    });
  }
  ws.getRow(1).font = { bold: true };
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export async function auditExport(ctx: AccessContext, format: string, rowCount: number, q: ReportQuery): Promise<void> {
  const db = getDb();
  await writeAudit(db, {
    actorUserId: ctx.user.id,
    action: 'REPORT_EXPORT',
    objectType: 'report',
    objectId: `attendance:${q.startDate}..${q.endDateExclusive}`,
    after: { format, rowCount, filters: { bureauId: q.bureauId ?? null, divisionId: q.divisionId ?? null, dayStatus: q.dayStatus ?? null } },
  });
}

export function todayRange(): { startDate: string; endDateExclusive: string } {
  const t = businessDate(new Date());
  return { startDate: t, endDateExclusive: addDays(t, 1) };
}

export type { PrismaClient };
