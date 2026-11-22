import type { AttendanceDay, AttendanceEvent, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { getDb } from '../../infrastructure/db.js';
import { loadEnv } from '../../config/env.js';
import { badRequest, conflict, forbidden, notFound, unprocessable } from '../../common/errors.js';
import { writeAudit } from '../../common/audit.js';
import { businessDate, businessWeekday, zonedTimeToUtc, parseDateOnly } from '../../common/time.js';
import { findReplay, computeRequestHash, idempotencyRecordData } from '../../common/idempotency.js';
import { reverseGeocode } from '../../common/geocode.js';
import { getOrCreateSnapshot, type ResolvedWorkday } from '../schedules/service.js';
import {
  validateAndProcessImage,
  generateObjectKey,
  uploadEvidence,
  compensateRemove,
  type ProcessedImage,
} from '../files/service.js';
import type { AccessContext } from '../access/context.js';
import { internAccessKind, internScopeWhere, requirePermission } from '../access/scope.js';

export interface SubmitInput {
  eventType: 'CHECK_IN' | 'CHECK_OUT';
  latitude: number | null;
  longitude: number | null;
  accuracyMeters?: number | null;
  idempotencyKey: string;
  clientSubmittedAt?: string | null;
  imageBuffer: Buffer;
  imageMime: string;
}

export interface SubmitResult {
  attendanceDayId: string;
  eventId: string;
  eventType: string;
  occurredAtServer: string;
  workDate: string;
  dayStatus: string;
  isLate: boolean | null;
  address: string | null;
  scheduleSnapshot: ResolvedWorkday;
}

function dayStatusAfterCheckIn(isLate: boolean): 'PRESENT' | 'LATE' {
  return isLate ? 'LATE' : 'PRESENT';
}

/**
 * Core attendance submission: validate -> image processing -> MinIO upload ->
 * single PostgreSQL transaction (event + day + evidence + idempotency + audit)
 * -> compensating object deletion on transaction failure.
 */
export async function submitAttendance(ctx: AccessContext, input: SubmitInput, requestId: string): Promise<SubmitResult> {
  requirePermission(ctx, 'attendance:submit');
  const db = getDb();
  const env = loadEnv();

  if (!ctx.internProfileId) throw forbidden('Hanya peserta magang yang dapat melakukan absensi sendiri.');
  const internProfileId = ctx.internProfileId;

  if (input.latitude != null && (input.latitude < -90 || input.latitude > 90)) {
    throw badRequest('Latitude tidak valid.', { latitude: ['Rentang -90..90'] });
  }
  if (input.longitude != null && (input.longitude < -180 || input.longitude > 180)) {
    throw badRequest('Longitude tidak valid.', { longitude: ['Rentang -180..180'] });
  }
  if (input.accuracyMeters != null && (input.accuracyMeters <= 0 || input.accuracyMeters > 100000)) {
    throw badRequest('Akurasi lokasi tidak valid.');
  }

  const operation = `attendance:${input.eventType}`;
  const requestHash = computeRequestHash({
    eventType: input.eventType,
    latitude: input.latitude,
    longitude: input.longitude,
    accuracyMeters: input.accuracyMeters ?? null,
    clientSubmittedAt: input.clientSubmittedAt ?? null,
  });

  // 1. Idempotency replay check (scoped to actor + operation + key).
  const replay = await findReplay(db, ctx.user.id, operation, input.idempotencyKey, requestHash);
  if (replay) return replay.responseBodyJson as SubmitResult;

  // 2. Schedule/workday validation (server time is authoritative).
  const now = new Date();
  const dateStr = businessDate(now);
  const weekday = businessWeekday(now);
  const snapshot = await getOrCreateSnapshot(db, internProfileId, dateStr, weekday);
  if (!snapshot.isWorkingDay) {
    throw unprocessable('Hari ini bukan hari kerja terjadwal. Absensi ditolak.');
  }

  // 3. Sequence + duplicate pre-checks (unique constraints are the final guard).
  const existingDay = await db.attendanceDay.findUnique({
    where: { internProfileId_workDate: { internProfileId, workDate: parseDateOnly(dateStr) } },
    include: { events: true },
  });
  if (input.eventType === 'CHECK_IN' && existingDay?.events.some((e) => e.eventType === 'CHECK_IN' && e.status !== 'VOIDED')) {
    throw conflict('Absen masuk sudah dilakukan hari ini.');
  }
  if (input.eventType === 'CHECK_OUT') {
    if (!existingDay?.checkInEventId) throw conflict('Absen pulang hanya dapat dilakukan setelah absen masuk.');
    if (existingDay.events.some((e) => e.eventType === 'CHECK_OUT' && e.status !== 'VOIDED')) {
      throw conflict('Absen pulang sudah dilakukan hari ini.');
    }
  }

  // 4. Validate + re-encode image (strips EXIF).
  const img: ProcessedImage = await validateAndProcessImage(input.imageBuffer, input.imageMime);

  // 5. Compute status from server time + snapshot (never client time).
  let isLate: boolean | null = null;
  let dayStatus: AttendanceDay['dayStatus'] = 'SCHEDULED';
  if (input.eventType === 'CHECK_IN') {
    if (snapshot.startTime) {
      const start = zonedTimeToUtc(snapshot.workDate, snapshot.startTime);
      const toleranceMs = (snapshot.lateToleranceMinutes ?? 0) * 60000;
      isLate = now.getTime() > start.getTime() + toleranceMs;
    } else {
      isLate = false;
    }
    dayStatus = dayStatusAfterCheckIn(isLate);
  } else {
    dayStatus = existingDay?.dayStatus ?? 'PRESENT';
    if (snapshot.endTime) {
      const end = zonedTimeToUtc(snapshot.workDate, snapshot.endTime);
      if (now.getTime() < end.getTime()) {
        // Early check-out: approved early-departure leave closes the day as authorized.
        const approvedEarly = await db.leaveRequest.findFirst({
          where: {
            internProfileId,
            workDate: parseDateOnly(dateStr),
            leaveType: 'EARLY_DEPARTURE',
            status: { in: ['APPROVED', 'COMPLETED'] },
          },
        });
        if (approvedEarly) {
          dayStatus = 'EARLY_DEPARTURE_APPROVED';
          if (approvedEarly.status === 'APPROVED') {
            await db.leaveRequest.update({ where: { id: approvedEarly.id }, data: { status: 'COMPLETED' } });
          }
        } else {
          dayStatus = 'NEEDS_REVIEW';
        }
      }
    }
  }

  // 6. Upload evidence to private bucket (opaque key, no PII).
  const bucket = env.MINIO_BUCKET_ATTENDANCE;
  const objectKey = generateObjectKey();
  await uploadEvidence(bucket, objectKey, img);

  // 7. Single transaction: evidence metadata + event + day + idempotency + audit.
  // Alamat di-resolve di luar transaksi (panggilan jaringan best-effort).
  const address =
    input.latitude != null && input.longitude != null
      ? await reverseGeocode(input.latitude, input.longitude)
      : null;
  try {
    const result = await db.$transaction(async (tx) => {
      let day: { id: string } | null = existingDay ? { id: existingDay.id } : null;
      if (!day) {
        day = await tx.attendanceDay.create({
          data: {
            internProfileId,
            workDate: parseDateOnly(dateStr),
            dayStatus,
            scheduleSnapshotJson: JSON.parse(JSON.stringify(snapshot)) as object,
          },
        });
      }
      const file = await tx.fileObject.create({
        data: {
          bucket,
          objectKey,
          mimeType: img.mimeType,
          sizeBytes: img.sizeBytes,
          checksumSha256: img.checksumSha256,
          width: img.width,
          height: img.height,
          uploadedById: ctx.user.id,
          status: 'ACTIVE',
        },
      });
      const event = await tx.attendanceEvent.create({
        data: {
          attendanceDayId: day.id,
          eventType: input.eventType,
          occurredAtServer: now,
          clientSubmittedAt: input.clientSubmittedAt ? new Date(input.clientSubmittedAt) : null,
          latitude: input.latitude,
          longitude: input.longitude,
          accuracyMeters: input.accuracyMeters ?? null,
          address,
          evidenceId: file.id,
          idempotencyKey: input.idempotencyKey,
          isLate,
          createdBy: ctx.user.id,
        },
      });
      const updatedDay = await tx.attendanceDay.update({
        where: { id: day.id },
        data:
          input.eventType === 'CHECK_IN'
            ? { checkInEventId: event.id, dayStatus }
            : { checkOutEventId: event.id, dayStatus },
      });
      const responseBody: SubmitResult = {
        attendanceDayId: updatedDay.id,
        eventId: event.id,
        eventType: event.eventType,
        occurredAtServer: event.occurredAtServer.toISOString(),
        workDate: dateStr,
        dayStatus: updatedDay.dayStatus,
        isLate,
        address,
        scheduleSnapshot: snapshot,
      };
      await tx.idempotencyRecord.create({
        data: idempotencyRecordData({
          actorUserId: ctx.user.id,
          operation,
          idempotencyKey: input.idempotencyKey,
          requestHash,
          responseStatus: 201,
          responseBody,
        }),
      });
      await writeAudit(tx as unknown as PrismaClient, {
        actorUserId: ctx.user.id,
        action: `ATTENDANCE_${input.eventType}`,
        objectType: 'attendance_day',
        objectId: updatedDay.id,
        after: { eventId: event.id, occurredAtServer: event.occurredAtServer.toISOString(), dayStatus: updatedDay.dayStatus, isLate },
        requestId,
      });
      return responseBody;
    });
    return result;
  } catch (err) {
    const code = (err as { code?: string }).code;
    // 8. Compensating deletion of the uploaded object.
    const removed = await compensateRemove(bucket, objectKey);
    if (!removed) {
      // Record orphan for reconciliation; log key only (no personal data).
      await db.fileObject
        .create({
          data: {
            bucket,
            objectKey,
            mimeType: img.mimeType,
            sizeBytes: img.sizeBytes,
            checksumSha256: img.checksumSha256,
            width: img.width,
            height: img.height,
            uploadedById: ctx.user.id,
            status: 'ORPHANED',
          },
        })
        .catch(() => undefined);
    }
    if (code === 'P2002') {
      throw conflict('Duplikasi event absensi terdeteksi. Operasi yang sama sudah tercatat.');
    }
    throw err;
  }
}

export function eventView(e: AttendanceEvent) {
  return {
    id: e.id,
    eventType: e.eventType,
    occurredAtServer: e.occurredAtServer.toISOString(),
    latitude: e.latitude,
    longitude: e.longitude,
    accuracyMeters: e.accuracyMeters,
    address: e.address,
    isLate: e.isLate,
    status: e.status,
    evidenceId: e.evidenceId,
  };
}

export async function getToday(ctx: AccessContext, requestId: string) {
  requirePermission(ctx, 'attendance:submit');
  if (!ctx.internProfileId) throw forbidden('Hanya peserta magang.');
  const db = getDb();
  await sweepStaleTemporaryLeaves(db);
  const dateStr = businessDate(new Date());
  const snapshot = await getOrCreateSnapshot(db, ctx.internProfileId, dateStr, businessWeekday(new Date()));
  const day = await db.attendanceDay.findUnique({
    where: { internProfileId_workDate: { internProfileId: ctx.internProfileId, workDate: parseDateOnly(dateStr) } },
    include: { events: { orderBy: { occurredAtServer: 'asc' } } },
  });
  const activeLeave = await db.leaveRequest.findFirst({
    where: {
      internProfileId: ctx.internProfileId,
      workDate: parseDateOnly(dateStr),
      status: { in: ['PENDING', 'APPROVED', 'DEPARTED', 'RETURNED'] },
    },
    include: { category: true, events: { orderBy: { occurredAtServer: 'asc' } } },
  });
  return {
    serverTime: new Date().toISOString(),
    workDate: dateStr,
    workday: snapshot,
    attendanceDay: day
      ? {
          id: day.id,
          dayStatus: day.dayStatus,
          correctionFlag: day.correctionFlag,
          events: day.events.map(eventView),
        }
      : null,
    activeLeave: activeLeave
      ? {
          id: activeLeave.id,
          leaveType: activeLeave.leaveType,
          status: activeLeave.status,
          categoryName: activeLeave.category.name,
          reason: activeLeave.reason,
          estimatedDepartureAt: activeLeave.estimatedDepartureAt.toISOString(),
          estimatedReturnAt: activeLeave.estimatedReturnAt?.toISOString() ?? null,
          events: activeLeave.events.map((e) => ({
            eventType: e.eventType,
            occurredAtServer: e.occurredAtServer.toISOString(),
          })),
        }
      : null,
    requestId,
  };
}

export async function listAttendance(ctx: AccessContext, query: {
  page: number;
  pageSize: number;
  startDate?: string;
  endDateExclusive?: string;
  internProfileId?: string;
  dayStatus?: string;
  bureauId?: string;
  divisionId?: string;
  search?: string;
}) {
  const db = getDb();
  const scoped = ctx.internProfileId && !ctx.permissions.has('attendance:view:scoped')
    ? { internProfileId: ctx.internProfileId }
    : { internProfile: await internScopeWhere(db, ctx) };

  if (query.internProfileId) {
    const kind = await internAccessKind(db, ctx, query.internProfileId);
    if (!kind) throw forbidden();
  }

  const profileFilter = {
    ...('internProfile' in scoped ? scoped.internProfile : {}),
    ...(query.bureauId ? { bureauId: query.bureauId } : {}),
    ...(query.divisionId ? { divisionId: query.divisionId } : {}),
    ...(query.search ? { user: { displayName: { contains: query.search, mode: 'insensitive' as const } } } : {}),
  };
  const where = {
    ...(query.internProfileId
      ? { internProfileId: query.internProfileId }
      : 'internProfileId' in scoped
        ? { internProfileId: scoped.internProfileId }
        : {}),
    ...('internProfile' in scoped || query.bureauId || query.divisionId || query.search
      ? { internProfile: profileFilter }
      : {}),
    ...(query.startDate || query.endDateExclusive
      ? {
          workDate: {
            ...(query.startDate ? { gte: parseDateOnly(query.startDate) } : {}),
            ...(query.endDateExclusive ? { lt: parseDateOnly(query.endDateExclusive) } : {}),
          },
        }
      : {}),
    ...(query.dayStatus ? { dayStatus: query.dayStatus as AttendanceDay['dayStatus'] } : {}),
  };

  const [total, items] = await Promise.all([
    db.attendanceDay.count({ where }),
    db.attendanceDay.findMany({
      where,
      include: {
        events: { orderBy: { occurredAtServer: 'asc' } },
        internProfile: { include: { user: { select: { displayName: true } }, bureau: true, division: true } },
      },
      orderBy: [{ workDate: 'desc' }, { internProfile: { user: { displayName: 'asc' } } }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  return {
    items: items.map((d) => ({
      id: d.id,
      internProfileId: d.internProfileId,
      participantName: d.internProfile.user.displayName,
      bureau: d.internProfile.bureau.name,
      division: d.internProfile.division?.name ?? null,
      workDate: d.workDate.toISOString().slice(0, 10),
      dayStatus: d.dayStatus,
      correctionFlag: d.correctionFlag,
      events: d.events.map(eventView),
    })),
    total,
  };
}

export async function getAttendanceDetail(ctx: AccessContext, attendanceDayId: string) {
  const db = getDb();
  const day = await db.attendanceDay.findUnique({
    where: { id: attendanceDayId },
    include: {
      events: { orderBy: { occurredAtServer: 'asc' } },
      internProfile: { include: { user: { select: { displayName: true, username: true } }, bureau: true, division: true, placement: true } },
    },
  });
  if (!day) throw notFound();
  const kind = await internAccessKind(db, ctx, day.internProfileId);
  if (!kind) throw notFound(); // 404 without data leak (IDOR protection)
  return {
    id: day.id,
    internProfileId: day.internProfileId,
    participantName: day.internProfile.user.displayName,
    bureau: day.internProfile.bureau.name,
    division: day.internProfile.division?.name ?? null,
    placement: day.internProfile.placement?.name ?? null,
    workDate: day.workDate.toISOString().slice(0, 10),
    dayStatus: day.dayStatus,
    correctionFlag: day.correctionFlag,
    scheduleSnapshot: day.scheduleSnapshotJson,
    events: day.events.map(eventView),
  };
}

/** Evidence access: authorize the underlying attendance record first, then stream bytes.
 * Browser melihat gambar via API (same-origin, cookie sesi) — bucket MinIO tidak pernah
 * terekspos langsung karena presigned URL memakai hostname internal Docker. */
export async function getEvidenceContent(ctx: AccessContext, attendanceDayId: string, eventId: string): Promise<{ stream: NodeJS.ReadableStream; mimeType: string }> {
  const db = getDb();
  const event = await db.attendanceEvent.findFirst({
    where: { id: eventId, attendanceDayId },
    include: { attendanceDay: true, evidence: true },
  });
  if (!event) throw notFound();
  const kind = await internAccessKind(db, ctx, event.attendanceDay.internProfileId);
  if (!kind) throw notFound();
  if (event.evidence.status !== 'ACTIVE') throw notFound('Bukti tidak tersedia.');
  await writeAudit(db, {
    actorUserId: ctx.user.id,
    action: 'EVIDENCE_ACCESS',
    objectType: 'attendance_event',
    objectId: event.id,
    requestId: null,
  });
  const { getObjectStream } = await import('../../infrastructure/minio.js');
  const stream = await getObjectStream(event.evidence.bucket, event.evidence.objectKey);
  return { stream, mimeType: event.evidence.mimeType };
}

/**
 * Correction: preserves the original value in audit before/after, requires reason,
 * recalculates derived status from the stored snapshot, never creates duplicate events.
 */
export async function correctAttendance(
  ctx: AccessContext,
  attendanceDayId: string,
  input: { correctedOccurredAt: string; reason: string; requestId: string },
) {
  requirePermission(ctx, 'attendance:correct');
  const db = getDb();
  const day = await db.attendanceDay.findUnique({
    where: { id: attendanceDayId },
    include: { events: true, internProfile: true },
  });
  if (!day) throw notFound();
  if (!ctx.hasGlobalAdminScope) {
    const kind = await internAccessKind(db, ctx, day.internProfileId);
    if (kind !== 'admin') throw forbidden('Koreksi di luar scope Anda.');
  } else {
    const kind = await internAccessKind(db, ctx, day.internProfileId);
    if (!kind || kind === 'self' || kind === 'supervisor') {
      // global admin scope authorized
    }
  }
  if (!input.reason || input.reason.trim().length < 5) throw badRequest('Alasan koreksi wajib diisi (minimal 5 karakter).');

  const corrected = new Date(input.correctedOccurredAt);
  if (Number.isNaN(corrected.getTime())) throw badRequest('Waktu koreksi tidak valid.');
  const workDateStr = day.workDate.toISOString().slice(0, 10);
  // Correction must stay within the same business day.
  if (businessDate(corrected) !== workDateStr) throw badRequest('Waktu koreksi harus berada pada hari kerja yang sama.');

  const snapshot = day.scheduleSnapshotJson as unknown as ResolvedWorkday;

  return db.$transaction(async (tx) => {
    const results = [];
    for (const event of day.events.filter((e) => e.status !== 'VOIDED')) {
      // Only correct CHECK_IN time in MVP correction flow when single event day,
      // or the event matching the requested type via occurred time proximity.
      const before = {
        eventId: event.id,
        eventType: event.eventType,
        occurredAtServer: event.occurredAtServer.toISOString(),
        isLate: event.isLate,
        dayStatus: day.dayStatus,
      };
      // Decide which event to correct: CHECK_IN if exists, else the single event.
      const isCheckIn = event.eventType === 'CHECK_IN';
      if (day.events.filter((e) => e.status !== 'VOIDED').length > 1 && !isCheckIn) continue;

      let isLate = event.isLate;
      if (isCheckIn && snapshot.startTime) {
        const start = zonedTimeToUtc(workDateStr, snapshot.startTime);
        isLate = corrected.getTime() > start.getTime() + (snapshot.lateToleranceMinutes ?? 0) * 60000;
      }
      const updated = await tx.attendanceEvent.update({
        where: { id: event.id },
        data: { occurredAtServer: corrected, isLate, status: 'CORRECTED' },
      });
      let newDayStatus = day.dayStatus;
      if (isCheckIn) {
        newDayStatus = day.checkOutEventId ? (day.dayStatus === 'NEEDS_REVIEW' ? day.dayStatus : dayStatusAfterCheckIn(!!isLate)) : dayStatusAfterCheckIn(!!isLate);
        if (day.dayStatus === 'EARLY_DEPARTURE_APPROVED' || day.dayStatus === 'NEEDS_REVIEW') newDayStatus = day.dayStatus;
      }
      await tx.attendanceDay.update({ where: { id: day.id }, data: { correctionFlag: true, dayStatus: newDayStatus } });
      await writeAudit(tx as unknown as PrismaClient, {
        actorUserId: ctx.user.id,
        action: 'ATTENDANCE_CORRECTION',
        objectType: 'attendance_event',
        objectId: event.id,
        before,
        after: {
          eventId: updated.id,
          occurredAtServer: updated.occurredAtServer.toISOString(),
          isLate: updated.isLate,
          dayStatus: newDayStatus,
        },
        reason: input.reason,
        requestId: input.requestId,
      });
      results.push({ before, after: { occurredAtServer: updated.occurredAtServer.toISOString() } });
    }
    if (results.length === 0) throw badRequest('Tidak ada event yang dapat dikoreksi pada hari ini.');
    return { attendanceDayId: day.id, corrections: results };
  });
}

/**
 * Temporary leave not returned by end of its workday becomes NEEDS_REVIEW
 * (never auto check-out). Lazy sweep invoked from read paths.
 */
export async function sweepStaleTemporaryLeaves(db: PrismaClient, todayStr: string = businessDate(new Date())): Promise<number> {
  const stale = await db.leaveRequest.findMany({
    where: { leaveType: 'TEMPORARY', status: 'DEPARTED', workDate: { lt: parseDateOnly(todayStr) } },
    include: { internProfile: true },
  });
  for (const leave of stale) {
    await db.$transaction(async (tx) => {
      await tx.leaveRequest.update({ where: { id: leave.id }, data: { status: 'NEEDS_REVIEW' } });
      const day = await tx.attendanceDay.findUnique({
        where: { internProfileId_workDate: { internProfileId: leave.internProfileId, workDate: leave.workDate } },
      });
      if (day && !day.checkOutEventId && day.dayStatus !== 'EARLY_DEPARTURE_APPROVED') {
        await tx.attendanceDay.update({ where: { id: day.id }, data: { dayStatus: 'NEEDS_REVIEW', leaveRequestId: leave.id } });
      }
      await writeAudit(tx as unknown as PrismaClient, {
        actorUserId: null,
        action: 'LEAVE_STALE_SWEEP',
        objectType: 'leave_request',
        objectId: leave.id,
        after: { status: 'NEEDS_REVIEW' },
        reason: 'Belum kembali sampai akhir hari; ditandai perlu review, bukan auto-checkout.',
      });
    });
  }
  return stale.length;
}

/** Reconciliation: orphaned FileObject rows and MinIO objects without DB rows. */
export async function reconcileOrphans(db: PrismaClient): Promise<{ orphanedRows: string[] }> {
  const orphaned = await db.fileObject.findMany({ where: { status: 'ORPHANED' }, select: { bucket: true, objectKey: true } });
  for (const o of orphaned) {
    const removed = await compensateRemove(o.bucket, o.objectKey);
    if (removed) {
      await db.fileObject.updateMany({
        where: { bucket: o.bucket, objectKey: o.objectKey, status: 'ORPHANED' },
        data: { status: 'DELETED' },
      });
    }
  }
  return { orphanedRows: orphaned.map((o) => o.objectKey) };
}

export function newRequestId(): string {
  return randomUUID();
}
