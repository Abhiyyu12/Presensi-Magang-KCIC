import type { LeaveRequest, Prisma, PrismaClient } from '@prisma/client';
import { getDb } from '../../infrastructure/db.js';
import { loadEnv } from '../../config/env.js';
import { badRequest, conflict, forbidden, notFound, unprocessable } from '../../common/errors.js';
import { writeAudit } from '../../common/audit.js';
import { businessDate, parseDateOnly } from '../../common/time.js';
import { findReplay, computeRequestHash, idempotencyRecordData } from '../../common/idempotency.js';
import { reverseGeocode } from '../../common/geocode.js';
import { validateAndProcessImage, generateObjectKey, uploadEvidence, compensateRemove } from '../files/service.js';
import type { AccessContext } from '../access/context.js';
import { requirePermission, internScopeWhere, internAccessKind, adminScopeCovers } from '../access/scope.js';

const ACTIVE_TEMPORARY_STATUSES = ['PENDING', 'APPROVED', 'DEPARTED', 'RETURNED'] as const;

export interface CreateLeaveInput {
  leaveType: 'TEMPORARY' | 'EARLY_DEPARTURE';
  categoryId: string;
  reason: string;
  estimatedDepartureAt: string;
  estimatedReturnAt?: string | null;
}

export async function createLeave(ctx: AccessContext, input: CreateLeaveInput, requestId: string): Promise<LeaveRequest> {
  requirePermission(ctx, 'leave:request');
  if (!ctx.internProfileId) throw forbidden('Hanya peserta magang yang dapat mengajukan izin.');
  const db = getDb();
  const internProfileId = ctx.internProfileId;
  const now = new Date();
  const dateStr = businessDate(now);

  const category = await db.leaveCategory.findUnique({ where: { id: input.categoryId } });
  if (!category || category.status !== 'ACTIVE') throw badRequest('Kategori izin tidak valid atau tidak aktif.');
  if (!input.reason || input.reason.trim().length < 5) throw badRequest('Alasan wajib diisi (minimal 5 karakter).');

  const departure = new Date(input.estimatedDepartureAt);
  if (Number.isNaN(departure.getTime())) throw badRequest('Estimasi waktu keluar tidak valid.');

  let returnAt: Date | null = null;
  if (input.leaveType === 'TEMPORARY') {
    if (!input.estimatedReturnAt) throw badRequest('Estimasi waktu kembali wajib untuk izin sementara.');
    returnAt = new Date(input.estimatedReturnAt);
    if (Number.isNaN(returnAt.getTime()) || returnAt <= departure) {
      throw badRequest('Estimasi waktu kembali harus setelah estimasi waktu keluar.');
    }
  }

  // Pengajuan hanya setelah check-in hari ini.
  const day = await db.attendanceDay.findUnique({
    where: { internProfileId_workDate: { internProfileId, workDate: parseDateOnly(dateStr) } },
  });
  if (!day?.checkInEventId) throw unprocessable('Izin tengah hari hanya dapat diajukan setelah absen masuk.');

  // Maksimal satu izin sementara aktif per peserta per hari.
  if (input.leaveType === 'TEMPORARY') {
    const active = await db.leaveRequest.count({
      where: { internProfileId, workDate: parseDateOnly(dateStr), leaveType: 'TEMPORARY', status: { in: [...ACTIVE_TEMPORARY_STATUSES] } },
    });
    if (active > 0) throw conflict('Sudah ada izin sementara aktif untuk hari ini.');
  }

  const leave = await db.$transaction(async (tx) => {
    let created: LeaveRequest;
    try {
      created = await tx.leaveRequest.create({
        data: {
          internProfileId,
          leaveType: input.leaveType,
          categoryId: input.categoryId,
          reason: input.reason.trim(),
          estimatedDepartureAt: departure,
          estimatedReturnAt: returnAt,
          workDate: parseDateOnly(dateStr),
          status: 'PENDING',
        },
      });
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') {
        throw conflict('Sudah ada izin sementara aktif untuk hari ini.');
      }
      throw err;
    }
    await writeAudit(tx as unknown as PrismaClient, {
      actorUserId: ctx.user.id,
      action: 'LEAVE_CREATE',
      objectType: 'leave_request',
      objectId: created.id,
      after: { leaveType: created.leaveType, status: created.status, workDate: dateStr },
      requestId,
    });
    return created;
  });
  return leave;
}

export async function decideLeave(
  ctx: AccessContext,
  leaveId: string,
  decision: 'approve' | 'reject',
  note: string | undefined,
  requestId: string,
): Promise<LeaveRequest> {
  requirePermission(ctx, 'leave:approve');
  const db = getDb();
  const leave = await db.leaveRequest.findUnique({ where: { id: leaveId }, include: { internProfile: true } });
  if (!leave) throw notFound();
  // Scope: scoped admin must cover the participant's bureau/division.
  if (!ctx.hasGlobalAdminScope && !adminScopeCovers(ctx, { bureauId: leave.internProfile.bureauId, divisionId: leave.internProfile.divisionId })) {
    throw forbidden('Permohonan di luar scope Anda.');
  }
  if (decision === 'reject' && (!note || note.trim().length < 3)) {
    throw badRequest('Penolakan wajib memiliki catatan.');
  }
  // Optimistic concurrency: only decide PENDING at the recorded version.
  const updated = await db.$transaction(async (tx) => {
    const res = await tx.leaveRequest.updateMany({
      where: { id: leaveId, status: 'PENDING', version: leave.version },
      data: {
        status: decision === 'approve' ? 'APPROVED' : 'REJECTED',
        decidedById: ctx.user.id,
        decidedAt: new Date(),
        decisionNote: note?.trim() ?? null,
        version: { increment: 1 },
      },
    });
    if (res.count === 0) throw conflict('Permohonan sudah diproses oleh pihak lain atau tidak dalam status pending.');
    const fresh = await tx.leaveRequest.findUniqueOrThrow({ where: { id: leaveId } });
    await writeAudit(tx as unknown as PrismaClient, {
      actorUserId: ctx.user.id,
      action: decision === 'approve' ? 'LEAVE_APPROVE' : 'LEAVE_REJECT',
      objectType: 'leave_request',
      objectId: leaveId,
      before: { status: 'PENDING', version: leave.version },
      after: { status: fresh.status, version: fresh.version, decisionNote: fresh.decisionNote },
      reason: note ?? null,
      requestId,
    });
    return fresh;
  });
  return updated;
}

export async function cancelLeave(ctx: AccessContext, leaveId: string, requestId: string): Promise<LeaveRequest> {
  const db = getDb();
  const leave = await db.leaveRequest.findUnique({ where: { id: leaveId }, include: { internProfile: true } });
  if (!leave) throw notFound();

  const isOwner = ctx.internProfileId === leave.internProfileId;
  const canCancelApproved = ctx.permissions.has('leave:cancel:approved');

  if (leave.status === 'PENDING') {
    // Peserta dapat membatalkan permohonan pending sendiri; approver juga boleh.
    if (!isOwner && !canCancelApproved) throw forbidden();
  } else if (leave.status === 'APPROVED') {
    // Approved tetapi belum digunakan hanya dapat dibatalkan oleh role berizin.
    if (!canCancelApproved) throw forbidden('Izin approved hanya dapat dibatalkan oleh role yang berwenang.');
  } else {
    throw conflict('Izin dengan status ini tidak dapat dibatalkan.');
  }

  return db.$transaction(async (tx) => {
    const res = await tx.leaveRequest.updateMany({
      where: { id: leaveId, status: leave.status },
      data: { status: 'CANCELLED', version: { increment: 1 } },
    });
    if (res.count === 0) throw conflict('Status izin berubah; pembatalan ditolak.');
    const fresh = await tx.leaveRequest.findUniqueOrThrow({ where: { id: leaveId } });
    await writeAudit(tx as unknown as PrismaClient, {
      actorUserId: ctx.user.id,
      action: 'LEAVE_CANCEL',
      objectType: 'leave_request',
      objectId: leaveId,
      before: { status: leave.status },
      after: { status: 'CANCELLED' },
      requestId,
    });
    return fresh;
  });
}

export interface MovementInput {
  latitude: number | null;
  longitude: number | null;
  accuracyMeters?: number | null;
  idempotencyKey: string;
  imageBuffer: Buffer;
  imageMime: string;
}

/**
 * Departure / return / early-checkout movements: only after APPROVED,
 * with selfie + GPS + server time, idempotent, transactional.
 * Early checkout becomes the day's CHECK_OUT exactly once.
 */
export async function submitMovement(
  ctx: AccessContext,
  leaveId: string,
  movementType: 'DEPARTURE' | 'RETURN' | 'EARLY_CHECKOUT',
  input: MovementInput,
  requestId: string,
) {
  requirePermission(ctx, 'leave:request');
  const db = getDb();
  const env = loadEnv();
  const leave = await db.leaveRequest.findUnique({ where: { id: leaveId } });
  if (!leave) throw notFound();
  if (ctx.internProfileId !== leave.internProfileId) throw forbidden('Pergerakan hanya dapat dicatat oleh pemilik izin.');

  if (leave.leaveType === 'TEMPORARY' && movementType === 'EARLY_CHECKOUT') throw badRequest('Izin sementara tidak memiliki pulang lebih awal.');
  if (leave.leaveType === 'EARLY_DEPARTURE' && movementType !== 'EARLY_CHECKOUT') {
    throw badRequest('Izin pulang lebih awal hanya mencatat early checkout.');
  }

  // State machine guard.
  const allowedFrom: Record<string, string[]> = {
    DEPARTURE: ['APPROVED', 'RETURNED'],
    RETURN: ['DEPARTED'],
    EARLY_CHECKOUT: ['APPROVED'],
  };
  if (!allowedFrom[movementType]!.includes(leave.status)) {
    throw conflict(`Pergerakan ${movementType} tidak diizinkan pada status ${leave.status}.`);
  }

  const operation = `leave-movement:${movementType}`;
  const requestHash = computeRequestHash({ leaveId, movementType, latitude: input.latitude, longitude: input.longitude });
  const replay = await findReplay(db, ctx.user.id, operation, input.idempotencyKey, requestHash);
  if (replay) return replay.responseBodyJson;

  if (input.latitude != null && (input.latitude < -90 || input.latitude > 90)) {
    throw badRequest('Koordinat tidak valid.');
  }
  if (input.longitude != null && (input.longitude < -180 || input.longitude > 180)) {
    throw badRequest('Koordinat tidak valid.');
  }
  if (input.accuracyMeters != null && (input.accuracyMeters <= 0 || input.accuracyMeters > 100000)) {
    throw badRequest('Akurasi lokasi tidak valid.');
  }

  const img = await validateAndProcessImage(input.imageBuffer, input.imageMime);
  const now = new Date();
  const dateStr = businessDate(now);
  const bucket = env.MINIO_BUCKET_ATTENDANCE;
  const objectKey = generateObjectKey(ctx.user.username);
  await uploadEvidence(bucket, objectKey, img);

  // Alamat di-resolve di luar transaksi (panggilan jaringan best-effort).
  const address =
    input.latitude != null && input.longitude != null
      ? await reverseGeocode(input.latitude, input.longitude)
      : null;

  try {
    return await db.$transaction(async (tx) => {
      const nextStatus = movementType === 'DEPARTURE' ? 'DEPARTED' : movementType === 'RETURN' ? 'RETURNED' : 'COMPLETED';
      const res = await tx.leaveRequest.updateMany({
        where: { id: leaveId, status: leave.status },
        data: { status: nextStatus as LeaveRequest['status'], version: { increment: 1 } },
      });
      if (res.count === 0) throw conflict('Status izin berubah bersamaan; coba lagi.');

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
      const event = await tx.leaveEvent.create({
        data: {
          leaveRequestId: leaveId,
          eventType: movementType,
          occurredAtServer: now,
          latitude: input.latitude,
          longitude: input.longitude,
          accuracyMeters: input.accuracyMeters ?? null,
          address,
          evidenceId: file.id,
          idempotencyKey: input.idempotencyKey,
        },
      });

      let attendanceInfo = null;
      if (movementType === 'EARLY_CHECKOUT') {
        // Pulang lebih awal berizin menjadi check-out hari itu — tepat satu kali.
        const day = await tx.attendanceDay.findUnique({
          where: { internProfileId_workDate: { internProfileId: leave.internProfileId, workDate: parseDateOnly(dateStr) } },
        });
        if (!day) throw conflict('Hari absensi tidak ditemukan; check-in terlebih dahulu.');
        if (day.checkOutEventId) throw conflict('Check-out sudah tercatat untuk hari ini.');
        const checkOut = await tx.attendanceEvent.create({
          data: {
            attendanceDayId: day.id,
            eventType: 'CHECK_OUT',
            occurredAtServer: now,
            latitude: input.latitude,
            longitude: input.longitude,
            accuracyMeters: input.accuracyMeters ?? null,
            address,
            evidenceId: file.id,
            idempotencyKey: input.idempotencyKey,
            createdBy: ctx.user.id,
          },
        });
        await tx.attendanceDay.update({
          where: { id: day.id },
          data: { checkOutEventId: checkOut.id, dayStatus: 'EARLY_DEPARTURE_APPROVED', leaveRequestId: leaveId },
        });
        attendanceInfo = { attendanceEventId: checkOut.id, dayStatus: 'EARLY_DEPARTURE_APPROVED' };
      }

      const responseBody = {
        leaveRequestId: leaveId,
        movementType,
        leaveEventId: event.id,
        occurredAtServer: now.toISOString(),
        leaveStatus: nextStatus,
        address,
        attendance: attendanceInfo,
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
        action: `LEAVE_MOVEMENT_${movementType}`,
        objectType: 'leave_request',
        objectId: leaveId,
        before: { status: leave.status },
        after: { status: nextStatus, leaveEventId: event.id },
        requestId,
      });
      return responseBody;
    });
  } catch (err) {
    const code = (err as { code?: string }).code;
    const removed = await compensateRemove(bucket, objectKey);
    if (!removed) {
      await db.fileObject
        .create({
          data: {
            bucket, objectKey, mimeType: img.mimeType, sizeBytes: img.sizeBytes,
            checksumSha256: img.checksumSha256, width: img.width, height: img.height,
            uploadedById: ctx.user.id, status: 'ORPHANED',
          },
        })
        .catch(() => undefined);
    }
    if (code === 'P2002') throw conflict('Duplikasi pergerakan terdeteksi.');
    throw err;
  }
}

export function leaveView(l: LeaveRequest & { category?: { name: string }; events?: { eventType: string; occurredAtServer: Date; address?: string | null }[] }) {
  return {
    id: l.id,
    internProfileId: l.internProfileId,
    leaveType: l.leaveType,
    categoryName: l.category?.name ?? null,
    reason: l.reason,
    estimatedDepartureAt: l.estimatedDepartureAt.toISOString(),
    estimatedReturnAt: l.estimatedReturnAt?.toISOString() ?? null,
    workDate: l.workDate.toISOString().slice(0, 10),
    status: l.status,
    requestedAt: l.requestedAt.toISOString(),
    decidedAt: l.decidedAt?.toISOString() ?? null,
    decisionNote: l.decisionNote ?? null,
    events: (l.events ?? []).map((e) => ({ eventType: e.eventType, occurredAtServer: e.occurredAtServer.toISOString(), address: e.address })),
  };
}

export async function listLeaves(ctx: AccessContext, query: {
  page: number;
  pageSize: number;
  status?: string;
  startDate?: string;
  endDateExclusive?: string;
  scope?: 'mine' | 'all';
}) {
  const db = getDb();
  const where: Prisma.LeaveRequestWhereInput = {};
  if (query.scope === 'mine' || !ctx.permissions.has('leave:view:scoped')) {
    if (!ctx.internProfileId) throw forbidden('Anda tidak memiliki data izin untuk ditampilkan.');
    requirePermission(ctx, 'leave:view:own');
    where.internProfileId = ctx.internProfileId;
  } else {
    const profileWhere = await internScopeWhere(db, ctx);
    where.internProfile = profileWhere;
  }
  if (query.status) where.status = query.status as LeaveRequest['status'];
  if (query.startDate || query.endDateExclusive) {
    where.workDate = {
      ...(query.startDate ? { gte: parseDateOnly(query.startDate) } : {}),
      ...(query.endDateExclusive ? { lt: parseDateOnly(query.endDateExclusive) } : {}),
    };
  }
  const [total, items] = await Promise.all([
    db.leaveRequest.count({ where }),
    db.leaveRequest.findMany({
      where,
      include: { category: true, events: { orderBy: { occurredAtServer: 'asc' } }, internProfile: { include: { user: { select: { displayName: true } } } } },
      orderBy: { requestedAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);
  return {
    items: items.map((l) => ({ ...leaveView(l), participantName: l.internProfile.user.displayName })),
    total,
  };
}

export async function getLeaveDetail(ctx: AccessContext, leaveId: string) {
  const db = getDb();
  const leave = await db.leaveRequest.findUnique({
    where: { id: leaveId },
    include: { category: true, events: { orderBy: { occurredAtServer: 'asc' }, include: { evidence: true } }, internProfile: { include: { user: { select: { displayName: true } } } } },
  });
  if (!leave) throw notFound();
  const kind = await internAccessKind(db, ctx, leave.internProfileId);
  if (!kind) throw notFound();
  return {
    ...leaveView(leave),
    participantName: leave.internProfile.user.displayName,
    events: leave.events.map((e) => ({
      eventType: e.eventType,
      occurredAtServer: e.occurredAtServer.toISOString(),
      latitude: kind === 'self' ? e.latitude : e.latitude,
      longitude: e.longitude,
      accuracyMeters: e.accuracyMeters,
      address: e.address,
      evidenceId: e.evidenceId,
    })),
  };
}
