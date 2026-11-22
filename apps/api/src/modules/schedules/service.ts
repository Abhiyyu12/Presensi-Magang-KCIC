import type { PrismaClient } from '@prisma/client';
import { notFound, conflict } from '../../common/errors.js';
import { parseDateOnly } from '../../common/time.js';

export interface ResolvedWorkday {
  internProfileId: string;
  workDate: string;
  isWorkingDay: boolean;
  scheduleId: string | null;
  scheduleName: string | null;
  startTime: string | null;
  endTime: string | null;
  lateToleranceMinutes: number | null;
  resolutionSource: 'GLOBAL' | 'BUREAU' | 'DIVISION' | 'INDIVIDUAL' | 'CALENDAR_OVERRIDE' | 'NONE';
  calendarDayType: 'NORMAL' | 'HOLIDAY' | 'WORKING_EXCEPTION' | null;
}

interface ScheduleCandidate {
  id: string;
  name: string;
  scopeType: 'GLOBAL' | 'BUREAU' | 'DIVISION' | 'INDIVIDUAL';
  days: {
    weekday: number;
    isWorkingDay: boolean;
    startTime: string | null;
    endTime: string | null;
    lateToleranceMinutes: number;
  }[];
}

const PRIORITY: Record<ScheduleCandidate['scopeType'], number> = {
  INDIVIDUAL: 4,
  DIVISION: 3,
  BUREAU: 2,
  GLOBAL: 1,
};

/**
 * Schedule resolution priority: individual > division > bureau > global.
 * Calendar HOLIDAY overrides everything (non-working day).
 * Calendar WORKING_EXCEPTION forces a working day using the resolved schedule's
 * times for that weekday when available.
 * Weekday: 1=Monday..7=Sunday (Asia/Jakarta).
 */
export async function resolveWorkday(
  db: PrismaClient,
  internProfileId: string,
  dateStr: string,
  weekday: number,
): Promise<ResolvedWorkday> {
  const base: ResolvedWorkday = {
    internProfileId,
    workDate: dateStr,
    isWorkingDay: false,
    scheduleId: null,
    scheduleName: null,
    startTime: null,
    endTime: null,
    lateToleranceMinutes: null,
    resolutionSource: 'NONE',
    calendarDayType: null,
  };

  const profile = await db.internProfile.findUnique({
    where: { id: internProfileId },
    select: { bureauId: true, divisionId: true, status: true },
  });
  if (!profile) throw notFound('Profil peserta tidak ditemukan.');

  const calendar = await db.calendarDay.findUnique({
    where: { calendarDate: parseDateOnly(dateStr) },
  });
  if (calendar && calendar.status === 'ACTIVE') {
    base.calendarDayType = calendar.dayType;
    if (calendar.dayType === 'HOLIDAY') {
      base.resolutionSource = 'CALENDAR_OVERRIDE';
      return base;
    }
  }

  const date = parseDateOnly(dateStr);
  const candidates = await db.workSchedule.findMany({
    where: {
      status: 'ACTIVE',
      validFrom: { lte: date },
      OR: [{ validTo: null }, { validTo: { gt: date } }],
      // scope match
      ...( {} ),
    },
    include: { days: true },
  });

  const matching = candidates.filter((c) => {
    switch (c.scopeType) {
      case 'GLOBAL': return c.scopeId === null;
      case 'BUREAU': return c.scopeId === profile.bureauId;
      case 'DIVISION': return profile.divisionId !== null && c.scopeId === profile.divisionId;
      case 'INDIVIDUAL': return c.scopeId === internProfileId;
    }
  });

  matching.sort((a, b) => PRIORITY[b.scopeType] - PRIORITY[a.scopeType] || a.validFrom.getTime() - b.validFrom.getTime());
  const chosen = matching[0] as (ScheduleCandidate & { validFrom: Date }) | undefined;

  if (calendar?.dayType === 'WORKING_EXCEPTION') {
    // Forced working day: use resolved schedule times when a day row exists.
    base.isWorkingDay = true;
    base.resolutionSource = 'CALENDAR_OVERRIDE';
    if (chosen) {
      const day = chosen.days.find((d) => d.weekday === weekday);
      base.scheduleId = chosen.id;
      base.scheduleName = chosen.name;
      base.startTime = day?.startTime ?? null;
      base.endTime = day?.endTime ?? null;
      base.lateToleranceMinutes = day?.lateToleranceMinutes ?? null;
    }
    return base;
  }

  if (!chosen) return base;

  const day = chosen.days.find((d) => d.weekday === weekday);
  base.scheduleId = chosen.id;
  base.scheduleName = chosen.name;
  base.resolutionSource = chosen.scopeType;
  if (day?.isWorkingDay) {
    base.isWorkingDay = true;
    base.startTime = day.startTime;
    base.endTime = day.endTime;
    base.lateToleranceMinutes = day.lateToleranceMinutes;
  }
  return base;
}

export interface ActiveSchedule {
  id: string;
  name: string;
  days: {
    weekday: number;
    isWorkingDay: boolean;
    startTime: string | null;
    endTime: string | null;
  }[];
}

/** Schedule berlaku hari ini untuk sebuah profil peserta (prioritas sama dengan resolveWorkday). */
export async function getActiveScheduleForProfile(
  db: PrismaClient,
  internProfileId: string,
  dateStr: string,
): Promise<ActiveSchedule | null> {
  const profile = await db.internProfile.findUnique({
    where: { id: internProfileId },
    select: { bureauId: true, divisionId: true },
  });
  if (!profile) return null;

  const date = parseDateOnly(dateStr);
  const candidates = await db.workSchedule.findMany({
    where: {
      status: 'ACTIVE',
      validFrom: { lte: date },
      OR: [{ validTo: null }, { validTo: { gt: date } }],
    },
    include: { days: { orderBy: { weekday: 'asc' } } },
  });

  const matching = candidates.filter((c) => {
    switch (c.scopeType) {
      case 'GLOBAL': return c.scopeId === null;
      case 'BUREAU': return c.scopeId === profile.bureauId;
      case 'DIVISION': return profile.divisionId !== null && c.scopeId === profile.divisionId;
      case 'INDIVIDUAL': return c.scopeId === internProfileId;
    }
  });

  matching.sort(
    (a, b) => PRIORITY[b.scopeType] - PRIORITY[a.scopeType] || a.validFrom.getTime() - b.validFrom.getTime(),
  );
  const chosen = matching[0];
  if (!chosen) return null;

  return {
    id: chosen.id,
    name: chosen.name,
    days: chosen.days.map((d) => ({
      weekday: d.weekday,
      isWorkingDay: d.isWorkingDay,
      startTime: d.startTime,
      endTime: d.endTime,
    })),
  };
}

/** Get or create the immutable snapshot for an intern+date (historical stability). */
export async function getOrCreateSnapshot(
  db: PrismaClient,
  internProfileId: string,
  dateStr: string,
  weekday: number,
): Promise<ResolvedWorkday> {
  const existing = await db.workdaySnapshot.findUnique({
    where: { internProfileId_workDate: { internProfileId, workDate: parseDateOnly(dateStr) } },
  });
  if (existing) {
    return {
      internProfileId,
      workDate: dateStr,
      isWorkingDay: existing.isWorkingDay,
      scheduleId: existing.scheduleId,
      scheduleName: existing.scheduleName,
      startTime: existing.startTime,
      endTime: existing.endTime,
      lateToleranceMinutes: existing.lateToleranceMinutes,
      resolutionSource: existing.resolutionSource,
      calendarDayType: existing.calendarDayType,
    };
  }
  const resolved = await resolveWorkday(db, internProfileId, dateStr, weekday);
  try {
    await db.workdaySnapshot.create({
      data: {
        internProfileId,
        workDate: parseDateOnly(dateStr),
        isWorkingDay: resolved.isWorkingDay,
        scheduleId: resolved.scheduleId,
        scheduleName: resolved.scheduleName,
        startTime: resolved.startTime,
        endTime: resolved.endTime,
        lateToleranceMinutes: resolved.lateToleranceMinutes,
        resolutionSource: resolved.resolutionSource,
        calendarDayType: resolved.calendarDayType,
      },
    });
  } catch (err) {
    if ((err as { code?: string }).code !== 'P2002') throw err;
    // concurrent create: re-read
    return getOrCreateSnapshot(db, internProfileId, dateStr, weekday);
  }
  return resolved;
}

/** Conflict detection: overlapping active schedules on the same scope. */
export async function assertNoScheduleConflict(
  db: PrismaClient,
  scopeType: string,
  scopeId: string | null,
  validFrom: Date,
  validTo: Date | null,
  excludeId?: string,
): Promise<void> {
  const overlapping = await db.workSchedule.count({
    where: {
      scopeType: scopeType as never,
      scopeId,
      status: 'ACTIVE',
      ...(excludeId ? { id: { not: excludeId } } : {}),
      validFrom: validTo ? { lt: validTo } : {},
      OR: [{ validTo: null }, { validTo: { gt: validFrom } }],
    },
  });
  if (overlapping > 0) {
    throw conflict('Jadwal dengan scope dan rentang tanggal efektif yang sama sudah ada (konflik jadwal).');
  }
}
