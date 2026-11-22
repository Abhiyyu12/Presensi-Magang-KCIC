import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app/buildApp.js';
import { getDb } from '../src/infrastructure/db.js';
import { addDays, businessDate, zonedTimeToUtc } from '../src/common/time.js';
import { authHeaders, buildMultipart, envelope, getHeaders, login, makeJpeg, type Session } from './helpers.js';
import ExcelJS from 'exceljs';
import { verifyPassword } from '../src/modules/auth/password.js';

const DEV_PASSWORD = 'DevPassword123!';
const today = businessDate();
const tomorrow = addDays(today, 1);
const yesterday = addDays(today, -1);

let app: FastifyInstance;
let jpeg: Buffer;
let admin: Session;
let bootstrap: Session;
let p1: Session;
let p2: Session;
let p1ProfileId: string;
let p2ProfileId: string;
let p2UserId: string;
let p1DayId: string;
let p1CheckInEventId: string;

async function post(app2: FastifyInstance, url: string, session: Session, payload: unknown) {
  return app2.inject({ method: 'POST', url, headers: authHeaders(session), payload });
}
async function get(app2: FastifyInstance, url: string, session?: Session) {
  return app2.inject({ method: 'GET', url, headers: session ? getHeaders(session) : {} });
}

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  jpeg = await makeJpeg();

  admin = await login(app, 'admin-hr', DEV_PASSWORD);
  bootstrap = await login(app, 'test-bootstrap-admin', 'BootstrapTest123!');
  p1 = await login(app, 'peserta1', DEV_PASSWORD);
  p2 = await login(app, 'peserta2', DEV_PASSWORD);

  const db = getDb();
  const u1 = await db.user.findUniqueOrThrow({ where: { username: 'peserta1' }, include: { internProfile: true } });
  p1ProfileId = u1.internProfile!.id;
  const u2 = await db.user.findUniqueOrThrow({ where: { username: 'peserta2' }, include: { internProfile: true } });
  p2ProfileId = u2.internProfile!.id;
  p2UserId = u2.id;

  // Individual schedules valid every weekday so tests are deterministic on any day.
  const days = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
    weekday,
    isWorkingDay: true,
    startTime: '09:00',
    endTime: '18:00',
    lateToleranceMinutes: 15,
  }));
  for (const [name, scopeId] of [
    [`Jadwal Individu Test P1 ${Date.now()}`, p1ProfileId],
    [`Jadwal Individu Test P2 ${Date.now()}`, p2ProfileId],
  ] as const) {
    const res = await post(app, '/api/v1/admin/schedules', admin, {
      name,
      scopeType: 'INDIVIDUAL',
      scopeId,
      validFrom: yesterday,
      days,
    });
    expect(res.statusCode).toBe(200);
  }
}, 240_000);

afterAll(async () => {
  await app?.close();
});

describe('authentication and CSRF', () => {
  it('rejects unauthenticated access with 401', async () => {
    const res = await get(app, '/api/v1/attendance/today');
    expect(res.statusCode).toBe(401);
  });

  it('rejects login with wrong password using a generic error', async () => {
    const csrfRes = await app.inject({ method: 'GET', url: '/api/v1/auth/csrf' });
    const csrf = csrfRes.cookies.find((c) => c.name === 'csrf_token')!.value;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { cookie: `csrf_token=${csrf}`, 'x-csrf-token': csrf, origin: 'http://localhost:5173' },
      payload: { username: 'peserta1', password: 'WrongPassword123!' },
    });
    expect(res.statusCode).toBe(401);
    // Generic combined message: never reveals whether the username or the password was wrong.
    expect(res.body.toLowerCase()).toContain('username atau password salah');
  });

  it('returns the documented error envelope on auth and business failures', async () => {
    const unauth = await get(app, '/api/v1/attendance/today');
    const unauthBody = JSON.parse(unauth.body) as { error?: { code?: string; message?: string; requestId?: string } };
    expect(unauthBody.error?.code).toBe('UNAUTHORIZED');
    expect(typeof unauthBody.error?.message).toBe('string');
    expect(typeof unauthBody.error?.requestId).toBe('string');

    const mp = buildMultipart(
      { latitude: '-6.9147', longitude: '107.6098', accuracyMeters: '12' },
      { field: 'image', filename: 'selfie.jpg', contentType: 'image/jpeg', content: jpeg },
    );
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/attendance/check-out',
      headers: authHeaders(p2, { 'content-type': mp.contentType, 'idempotency-key': `envelope-co-${Date.now()}` }),
      payload: mp.body,
    });
    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body) as { error?: { code?: string; message?: string } };
    expect(body.error?.code).toBe('CONFLICT');
    expect(body.error?.message).toContain('Absen pulang hanya dapat dilakukan setelah absen masuk');
  });

  it('rejects unsafe method without CSRF header', async () => {
    // Logout has no body schema, so the CSRF check in authenticate is reached
    // (routes with body schemas would fail validation first).
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { cookie: p1.cookie, origin: 'http://localhost:5173' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns effective permissions and feature tree for peserta', async () => {
    const res = await get(app, '/api/v1/access/me/effective', p1);
    expect(res.statusCode).toBe(200);
    const body = envelope(res);
    expect(body.data.permissions).toContain('attendance:submit');
    expect(Array.isArray(body.data.featureTree)).toBe(true);
  });
});

describe('attendance flow and idempotency', () => {
  it('rejects check-out before check-in (sequence)', async () => {
    const mp = buildMultipart(
      { latitude: '-6.9147', longitude: '107.6098', accuracyMeters: '12' },
      { field: 'image', filename: 'selfie.jpg', contentType: 'image/jpeg', content: jpeg },
    );
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/attendance/check-out',
      headers: authHeaders(p2, { 'content-type': mp.contentType, 'idempotency-key': `co-before-ci-${Date.now()}` }),
      payload: mp.body,
    });
    expect(res.statusCode).toBe(409);
  });

  it('peserta2 full check-in/check-out day', async () => {
    const mp = buildMultipart(
      { latitude: '-6.9147', longitude: '107.6098', accuracyMeters: '12' },
      { field: 'image', filename: 'selfie.jpg', contentType: 'image/jpeg', content: jpeg },
    );
    const ci = await app.inject({
      method: 'POST',
      url: '/api/v1/attendance/check-in',
      headers: authHeaders(p2, { 'content-type': mp.contentType, 'idempotency-key': `ci-p2-${Date.now()}` }),
      payload: mp.body,
    });
    expect(ci.statusCode).toBe(201);
    const ciBody = envelope(ci);
    expect(['PRESENT', 'LATE']).toContain(ciBody.data.dayStatus ?? ciBody.data.day?.dayStatus);

    const mp2 = buildMultipart(
      { latitude: '-6.9147', longitude: '107.6098', accuracyMeters: '12' },
      { field: 'image', filename: 'selfie.jpg', contentType: 'image/jpeg', content: jpeg },
    );
    const co = await app.inject({
      method: 'POST',
      url: '/api/v1/attendance/check-out',
      headers: authHeaders(p2, { 'content-type': mp2.contentType, 'idempotency-key': `co-p2-${Date.now()}` }),
      payload: mp2.body,
    });
    expect(co.statusCode).toBe(201);
  });

  it('peserta1 check-in succeeds, replays idempotently, and blocks duplicates', async () => {
    const key = `ci-p1-fixed-${today}`;
    // Build the multipart body ONCE: boundary must match between the
    // content-type header and the payload for every (replayed) request.
    const mp = buildMultipart(
      { latitude: '-6.9147', longitude: '107.6098', accuracyMeters: '10' },
      { field: 'image', filename: 'selfie.jpg', contentType: 'image/jpeg', content: jpeg },
    );

    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/attendance/check-in',
      headers: authHeaders(p1, { 'content-type': mp.contentType, 'idempotency-key': key }),
      payload: mp.body,
    });
    expect(first.statusCode).toBe(201);
    const firstBody = envelope(first);
    p1DayId = firstBody.data.attendanceDayId ?? firstBody.data.day?.id ?? firstBody.data.id;
    p1CheckInEventId = firstBody.data.eventId;
    expect(p1DayId).toBeTruthy();

    // Same key + same request => replayed stored response.
    const replay = await app.inject({
      method: 'POST',
      url: '/api/v1/attendance/check-in',
      headers: authHeaders(p1, { 'content-type': mp.contentType, 'idempotency-key': key }),
      payload: mp.body,
    });
    expect(replay.statusCode).toBe(201);

    // Duplicate action with a NEW key => conflict (already checked in).
    const dup = await app.inject({
      method: 'POST',
      url: '/api/v1/attendance/check-in',
      headers: authHeaders(p1, { 'content-type': mp.contentType, 'idempotency-key': `ci-p1-dup-${Date.now()}` }),
      payload: mp.body,
    });
    expect(dup.statusCode).toBe(409);
  });

  it('serves evidence via short-lived signed URL only', async () => {
    const day = envelope(await get(app, `/api/v1/attendance/${p1DayId}`, p1));
    const eventId =
      day.data.checkInEvent?.id ?? day.data.events?.find((e: any) => e.eventType === 'CHECK_IN')?.id ?? p1CheckInEventId;
    expect(eventId).toBeTruthy();

    const res = await get(app, `/api/v1/attendance/${p1DayId}/evidence?eventId=${eventId}`, p1);
    expect(res.statusCode).toBe(200);
    const url = envelope(res).data.url;
    expect(url).toMatch(/^http/);
    const fetched = await fetch(url);
    expect(fetched.status).toBe(200);
    expect(Number(fetched.headers.get('content-length'))).toBeGreaterThan(0);

    // Another intern cannot access it: 404 without leaking existence.
    const denied = await get(app, `/api/v1/attendance/${p1DayId}/evidence?eventId=${eventId}`, p2);
    expect(denied.statusCode).toBe(404);
  });

  it('prevents IDOR: peserta2 cannot read peserta1 attendance detail', async () => {
    const res = await get(app, `/api/v1/attendance/${p1DayId}`, p2);
    expect(res.statusCode).toBe(404);
  });

  it('reports today state for peserta1', async () => {
    const res = await get(app, '/api/v1/attendance/today', p1);
    expect(res.statusCode).toBe(200);
    const body = envelope(res);
    expect(body.data.serverDate ?? body.data.serverTime ?? body.data).toBeTruthy();
  });
});

describe('leave workflow (temporary departure + early checkout)', () => {
  let categoryId: string;
  let temporaryLeaveId: string;
  let earlyLeaveId: string;

  it('lists active categories for peserta and denies accounts without leave:request', async () => {
    const res = await get(app, '/api/v1/leaves/categories', p1);
    expect(res.statusCode).toBe(200);
    const body = envelope(res);
    expect(body.data.items.length).toBeGreaterThan(0);
    const denied = await get(app, '/api/v1/leaves/categories', admin);
    expect(denied.statusCode).toBe(403);
  });

  it('rejects leave creation before check-in for peserta2 (already checked in, so use validation path)', async () => {
    const res = await post(app, '/api/v1/leaves', p1, {
      leaveType: 'TEMPORARY',
      categoryId: '00000000-0000-0000-0000-000000000000',
      reason: 'Alasan tidak valid kategori',
      estimatedDepartureAt: new Date().toISOString(),
      estimatedReturnAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    expect([400, 404, 422]).toContain(res.statusCode);
  });

  it('creates, rejects-with-note-validation, approves, departs and returns a TEMPORARY leave', async () => {
    const cats = envelope(await get(app, '/api/v1/admin/leave-categories', admin));
    categoryId = cats.data.items.find((c: any) => c.status === 'ACTIVE').id;

    const created = await post(app, '/api/v1/leaves', p1, {
      leaveType: 'TEMPORARY',
      categoryId,
      reason: 'Keperluan kampus mendadak (data dummy uji coba).',
      estimatedDepartureAt: new Date().toISOString(),
      estimatedReturnAt: new Date(Date.now() + 2 * 3600_000).toISOString(),
    });
    expect(created.statusCode).toBe(201);
    temporaryLeaveId = envelope(created).data.id;

    // Reject without note must fail validation.
    const badReject = await post(app, `/api/v1/leaves/${temporaryLeaveId}/reject`, admin, {});
    expect(badReject.statusCode).toBe(400);

    const approved = await post(app, `/api/v1/leaves/${temporaryLeaveId}/approve`, admin, { note: 'Disetujui (uji).' });
    expect(approved.statusCode).toBe(200);
    expect(envelope(approved).data.status).toBe('APPROVED');

    const dep = buildMultipart({ latitude: '-6.9147', longitude: '107.6098' }, { field: 'image', filename: 'd.jpg', contentType: 'image/jpeg', content: jpeg });
    const depRes = await app.inject({
      method: 'POST',
      url: `/api/v1/leaves/${temporaryLeaveId}/departure`,
      headers: authHeaders(p1, { 'content-type': dep.contentType, 'idempotency-key': `dep-${Date.now()}` }),
      payload: dep.body,
    });
    expect(depRes.statusCode).toBe(201);
    expect(envelope(depRes).data.leaveStatus).toBe('DEPARTED');

    const ret = buildMultipart({ latitude: '-6.9147', longitude: '107.6098' }, { field: 'image', filename: 'r.jpg', contentType: 'image/jpeg', content: jpeg });
    const retRes = await app.inject({
      method: 'POST',
      url: `/api/v1/leaves/${temporaryLeaveId}/return`,
      headers: authHeaders(p1, { 'content-type': ret.contentType, 'idempotency-key': `ret-${Date.now()}` }),
      payload: ret.body,
    });
    expect(retRes.statusCode).toBe(201);
    expect(envelope(retRes).data.leaveStatus).toBe('RETURNED');
  });

  it('early checkout via approved EARLY_DEPARTURE leave completes the day', async () => {
    const created = await post(app, '/api/v1/leaves', p1, {
      leaveType: 'EARLY_DEPARTURE',
      categoryId,
      reason: 'Kontrol kesehatan sore (data dummy uji coba).',
      estimatedDepartureAt: new Date(Date.now() + 3600_000).toISOString(),
      estimatedReturnAt: null,
    });
    expect(created.statusCode).toBe(201);
    earlyLeaveId = envelope(created).data.id;

    const approved = await post(app, `/api/v1/leaves/${earlyLeaveId}/approve`, admin, { note: 'OK (uji).' });
    expect(approved.statusCode).toBe(200);

    const ec = buildMultipart({ latitude: '-6.9147', longitude: '107.6098' }, { field: 'image', filename: 'e.jpg', contentType: 'image/jpeg', content: jpeg });
    const ecRes = await app.inject({
      method: 'POST',
      url: `/api/v1/leaves/${earlyLeaveId}/early-checkout`,
      headers: authHeaders(p1, { 'content-type': ec.contentType, 'idempotency-key': `ec-${Date.now()}` }),
      payload: ec.body,
    });
    expect(ecRes.statusCode).toBe(201);

    const day = envelope(await get(app, `/api/v1/attendance/${p1DayId}`, p1));
    const dayStatus = day.data.dayStatus ?? day.data.day?.dayStatus;
    expect(dayStatus).toBe('EARLY_DEPARTURE_APPROVED');
  });
});

describe('correction and audit', () => {
  it('admin correction updates time, keeps audit trail with before/after', async () => {
    const corrected = zonedTimeToUtc(today, '08:55').toISOString();
    const res = await post(app, `/api/v1/admin/attendance/${p1DayId}/correction`, admin, {
      correctedOccurredAt: corrected,
      reason: 'Uji koreksi: waktu perangkat peserta tidak akurat.',
    });
    expect(res.statusCode).toBe(200);

    const audits = envelope(await get(app, '/api/v1/admin/audit?objectType=attendance_event&action=ATTENDANCE_CORRECTION', bootstrap));
    expect(audits.data.items.length).toBeGreaterThan(0);
    const entry = audits.data.items[0];
    expect(entry.before ?? entry.beforeJson).toBeTruthy();
    expect(entry.after ?? entry.afterJson).toBeTruthy();
  });

  it('rejects correction with too-short reason', async () => {
    const res = await post(app, `/api/v1/admin/attendance/${p1DayId}/correction`, admin, {
      correctedOccurredAt: zonedTimeToUtc(today, '08:50').toISOString(),
      reason: 'abc',
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('reports and export', () => {
  it('returns rows including scheduled participants and metrics', async () => {
    const res = await get(app, `/api/v1/reports/attendance?startDate=${today}&endDateExclusive=${tomorrow}`, admin);
    expect(res.statusCode).toBe(200);
    const body = envelope(res);
    expect(body.data.items.length).toBeGreaterThanOrEqual(2);
    expect(body.data.metrics).toBeTruthy();
    expect(typeof body.data.metrics.terjadwal).toBe('number');
  });

  it('exports CSV within the same scope and audits the export', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/reports/attendance/export?format=csv&startDate=${today}&endDateExclusive=${tomorrow}`,
      headers: getHeaders(admin),
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-type']).toContain('text/csv');
    // No evidence coordinates or URLs in exports.
    expect(res.body).not.toContain('latitude');
  });

  it('denies reports to peserta', async () => {
    const res = await get(app, `/api/v1/reports/attendance?startDate=${today}&endDateExclusive=${tomorrow}`, p1);
    expect(res.statusCode).toBe(403);
  });

  it('lists own history rows for peserta (personal scope)', async () => {
    const res = await get(app, `/api/v1/attendance?scope=mine&startDate=${today}&endDateExclusive=${tomorrow}`, p1);
    expect(res.statusCode).toBe(200);
    const body = envelope(res);
    expect(body.data.items.some((r: { id: string }) => r.id === p1DayId)).toBe(true);
  });

  it('exports own history CSV for peserta without coordinates', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/attendance/export?startDate=${today}&endDateExclusive=${tomorrow}`,
      headers: getHeaders(p1),
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.body).toContain('Tanggal,Status');
    expect(res.body).toContain(today);
    expect(res.body.trim().split('\n').length).toBeGreaterThan(1);
    expect(res.body).not.toContain('latitude');
  });

  it('denies personal CSV export to accounts without intern profile', async () => {
    const res = await get(app, '/api/v1/attendance/export', admin);
    expect(res.statusCode).toBe(403);
  });
});

describe('dynamic business parameters (no hardcoded policy)', () => {
  it('serves schedule form defaults from business parameters and denies peserta', async () => {
    const res = await get(app, '/api/v1/admin/schedules/form-defaults', admin);
    expect(res.statusCode).toBe(200);
    const data = envelope(res).data;
    expect(Array.isArray(data.defaultWorkdays)).toBe(true);
    expect(data.lateToleranceDefaultMinutes).toBe(15);
    const denied = await get(app, '/api/v1/admin/schedules/form-defaults', p1);
    expect(denied.statusCode).toBe(403);
  });

  it('schedule tolerance follows the DB parameter when omitted, including after the parameter changes', async () => {
    const db = getDb();
    const profile = await db.internProfile.findUniqueOrThrow({ where: { id: p1ProfileId } });
    const days = [{ weekday: 1, isWorkingDay: true, startTime: '09:00', endTime: '18:00' }];
    const created = await post(app, '/api/v1/admin/schedules', admin, {
      name: `Jadwal Divisi Uji Param ${Date.now()}`,
      scopeType: 'DIVISION',
      scopeId: profile.divisionId,
      validFrom: yesterday,
      days,
    });
    expect(created.statusCode).toBe(200);
    const scheduleId = envelope(created).data.id as string;
    expect((envelope(created).data.days as { lateToleranceMinutes: number }[])[0]!.lateToleranceMinutes).toBe(15);

    const upd = await post(app, '/api/v1/admin/business-parameters', admin, {
      key: 'late_tolerance_default_minutes',
      valueJson: { value: 25 },
    });
    expect(upd.statusCode).toBe(200);

    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/schedules/${scheduleId}`,
      headers: authHeaders(admin),
      payload: { days },
    });
    expect(patched.statusCode).toBe(200);
    expect((envelope(patched).data.days as { lateToleranceMinutes: number }[])[0]!.lateToleranceMinutes).toBe(25);

    const restored = await post(app, '/api/v1/admin/business-parameters', admin, {
      key: 'late_tolerance_default_minutes',
      valueJson: { value: 15, status: 'PENDING_KCIC_CONFIRMATION' },
    });
    expect(restored.statusCode).toBe(200);
    const deactivated = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/schedules/${scheduleId}`,
      headers: authHeaders(admin),
      payload: { status: 'INACTIVE' },
    });
    expect(deactivated.statusCode).toBe(200);
  });

  it('rejects invalid clientSubmittedAt with 400 instead of a server error', async () => {
    const mp = buildMultipart(
      { latitude: '-6.9147', longitude: '107.6098', accuracyMeters: '10', clientSubmittedAt: 'bukan-tanggal' },
      { field: 'image', filename: 'x.jpg', contentType: 'image/jpeg', content: jpeg },
    );
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/attendance/check-in',
      headers: authHeaders(p1, { 'content-type': mp.contentType, 'idempotency-key': `badts-${Date.now()}` }),
      payload: mp.body,
    });
    expect(res.statusCode).toBe(400);
    expect(envelope(res).error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects leave movement with invalid location accuracy', async () => {
    const cats = envelope(await get(app, '/api/v1/leaves/categories', p2));
    const created = await post(app, '/api/v1/leaves', p2, {
      leaveType: 'TEMPORARY',
      categoryId: cats.data.items[0].id,
      reason: 'Uji akurasi lokasi pergerakan izin (data dummy).',
      estimatedDepartureAt: new Date().toISOString(),
      estimatedReturnAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    expect(created.statusCode).toBe(201);
    const leaveId = envelope(created).data.id as string;
    const approved = await post(app, `/api/v1/leaves/${leaveId}/approve`, admin, { note: 'Disetujui (uji akurasi).' });
    expect(approved.statusCode).toBe(200);

    const mp = buildMultipart(
      { latitude: '-6.9147', longitude: '107.6098', accuracyMeters: '0' },
      { field: 'image', filename: 'd.jpg', contentType: 'image/jpeg', content: jpeg },
    );
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/leaves/${leaveId}/departure`,
      headers: authHeaders(p2, { 'content-type': mp.contentType, 'idempotency-key': `acc-${Date.now()}` }),
      payload: mp.body,
    });
    expect(res.statusCode).toBe(400);

    const cancelled = await post(app, `/api/v1/leaves/${leaveId}/cancel`, admin, {});
    expect(cancelled.statusCode).toBe(200);
  });
});

describe('frontend-backend contract fixes', () => {
  it('returns role detail with permission entries for the access panel', async () => {
    const roles = envelope(await get(app, '/api/v1/admin/access/roles', bootstrap));
    const internRole = roles.data.items.find((r: any) => r.code === 'INTERN');
    const detail = await get(app, `/api/v1/admin/access/roles/${internRole.id}`, bootstrap);
    expect(detail.statusCode).toBe(200);
    const perms = envelope(detail).data.permissions as { permissionCode: string; effect: string }[];
    expect(perms.some((p) => p.permissionCode === 'attendance:submit' && p.effect === 'ALLOW')).toBe(true);
    const denied = await get(app, `/api/v1/admin/access/roles/${internRole.id}`, admin);
    expect(denied.statusCode).toBe(403);
  });

  it('updates a business parameter by id via PATCH (Parameter tab) and still rejects executable keys', async () => {
    const list = envelope(await get(app, '/api/v1/admin/business-parameters?key=late_tolerance_default_minutes', admin));
    const param = list.data.items[0];
    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/business-parameters/${param.id}`,
      headers: authHeaders(admin),
      payload: { valueJson: { value: 15, status: 'PENDING_KCIC_CONFIRMATION' }, description: 'Usulan default; dapat dioverride per jadwal' },
    });
    expect(patched.statusCode).toBe(200);
    expect(envelope(patched).data.valueJson.value).toBe(15);
    const bad = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/business-parameters/${param.id}`,
      headers: authHeaders(admin),
      payload: { valueJson: { sql: 'DROP TABLE users' } },
    });
    expect(bad.statusCode).toBe(422);
  });

  it('accepts scope=all for scoped leave viewers (Izin Peserta page)', async () => {
    const res = await get(app, '/api/v1/leaves?scope=all&page=1&pageSize=15', admin);
    expect(res.statusCode).toBe(200);
  });

  it('applies monitoring search and bureau filters server-side', async () => {
    const db = getDb();
    const u1 = await db.user.findUniqueOrThrow({ where: { username: 'peserta1' } });
    const bySearch = envelope(await get(app, `/api/v1/attendance?search=${encodeURIComponent(u1.displayName)}&page=1&pageSize=100`, admin));
    expect(bySearch.data.pagination.total).toBeGreaterThan(0);
    for (const item of bySearch.data.items) expect(item.internProfileId).toBe(p1ProfileId);

    const profile = await db.internProfile.findUniqueOrThrow({ where: { id: p1ProfileId }, include: { bureau: true } });
    const byBureau = envelope(await get(app, `/api/v1/attendance?bureauId=${profile.bureauId}&page=1&pageSize=100`, admin));
    expect(byBureau.data.pagination.total).toBeGreaterThan(0);
    for (const item of byBureau.data.items) expect(item.bureau).toBe(profile.bureau.name);
  });
});

describe('access administration', () => {
  it('creates new role with zero permissions and simulate denies by default', async () => {
    const code = `ROLE_UJI_${Date.now()}`;
    const created = await post(app, '/api/v1/admin/access/roles', bootstrap, { code, name: 'Role Uji Coba' });
    expect(created.statusCode).toBe(200);

    const sim = await get(
      app,
      `/api/v1/admin/access/simulate?userId=${p2UserId}&permissionCode=access:roles:manage`,
      bootstrap,
    );
    expect(sim.statusCode).toBe(200);
    expect(envelope(sim).data.allowed).toBe(false);
  });

  it('denies role management to ADMIN_HR (governance is IT-only)', async () => {
    const res = await post(app, '/api/v1/admin/access/roles', admin, { code: `X_${Date.now()}`, name: 'Tidak boleh' });
    expect(res.statusCode).toBe(403);
  });

  it('exposes a read-only role catalog to ADMIN_HR and maps roles onto the user list', async () => {
    const catalog = await get(app, '/api/v1/admin/roles', admin);
    expect(catalog.statusCode).toBe(200);
    const codes = envelope(catalog).data.items.map((r: any) => r.code);
    expect(codes).toContain('INTERN');

    const users = await get(app, '/api/v1/admin/users?search=peserta1', admin);
    expect(users.statusCode).toBe(200);
    const row = envelope(users).data.items.find((u: any) => u.username === 'peserta1');
    expect(row.roles.map((r: any) => r.code)).toContain('INTERN');
  });

  it('rejects business parameters containing executable keys', async () => {
    const res = await post(app, '/api/v1/admin/business-parameters', admin, {
      key: `uji_param_${Date.now()}`,
      valueJson: { sql: 'DROP TABLE users' },
    });
    expect(res.statusCode).toBe(422);
  });
});

describe('help center visibility', () => {
  it('published article visible to peserta, draft hidden with 404 (no leak)', async () => {
    const pub = await get(app, '/api/v1/help/articles/cara-absensi', p1);
    expect(pub.statusCode).toBe(200);
    const draft = await get(app, '/api/v1/help/articles/draf-kebijakan-izin', p1);
    expect(draft.statusCode).toBe(404);
    const draftAsAdmin = await get(app, '/api/v1/help/articles/draf-kebijakan-izin', bootstrap);
    expect(draftAsAdmin.statusCode).toBe(200);
  });
});

describe('account lifecycle', () => {
  it('deactivating a user revokes their sessions immediately', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/users/${p2UserId}`,
      headers: authHeaders(bootstrap),
      payload: { accountStatus: 'INACTIVE' },
    });
    expect(res.statusCode).toBe(200);
    const me = await get(app, '/api/v1/auth/me', p2);
    expect(me.statusCode).toBe(401);
  });
});

describe('admin dashboard filters (Fase 1.1)', () => {
  it('returns counts, range, and daily series with default = today', async () => {
    const res = await get(app, '/api/v1/dashboard/admin', admin);
    expect(res.statusCode).toBe(200);
    const body = envelope(res).data;
    expect(body.counts).toHaveProperty('checkedIn');
    expect(Array.isArray(body.series)).toBe(true);
    expect(body.range.from).toBe(body.range.to);
    expect(body.series.length).toBeGreaterThan(0);
  });

  it('filters by organization scope: bureau without interns yields zero', async () => {
    const bureaus = envelope(await get(app, '/api/v1/admin/organizations/bureaus', admin)).data;
    const biroTek = bureaus.items.find((b: { code: string }) => b.code === 'BIO-TEK');
    expect(biroTek).toBeTruthy();
    const scoped = envelope(await get(app, `/api/v1/dashboard/admin?bureauId=${biroTek.id}`, admin)).data;
    expect(scoped.counts.checkedIn).toBe(0);
    const base = envelope(await get(app, '/api/v1/dashboard/admin', admin)).data;
    expect(base.counts.checkedIn).toBeGreaterThan(0);
  });

  it('validates time filter format and inverted range on the backend', async () => {
    const badFormat = await get(app, '/api/v1/dashboard/admin?date=22-11-2026', admin);
    expect(badFormat.statusCode).toBe(400);
    const inverted = await get(app, '/api/v1/dashboard/admin?from=2026-12-31&to=2026-01-01', admin);
    expect(inverted.statusCode).toBe(400);
  });
});

describe('Fase 1.2-1.4: pagination server-side, urutan terbaru, alasan izin', () => {
  it('attendance list honors pageSize and returns descending dates', async () => {
    const res = await get(
      app,
      `/api/v1/attendance?page=1&pageSize=10&startDate=${yesterday}&endDateExclusive=${addDays(today, 2)}`,
      admin,
    );
    expect(res.statusCode).toBe(200);
    const body = envelope(res);
    expect(body.data.pagination.pageSize).toBe(10);
    expect(body.data.items.length).toBeLessThanOrEqual(10);
    const dates = body.data.items.map((r: { workDate: string }) => r.workDate);
    for (let i = 1; i < dates.length; i += 1) {
      expect(dates[i - 1] >= dates[i]).toBe(true);
    }
  });

  it('report rows are newest-first across multiple days', async () => {
    const res = await get(
      app,
      `/api/v1/reports/attendance?startDate=${yesterday}&endDateExclusive=${addDays(today, 2)}&pageSize=100`,
      admin,
    );
    expect(res.statusCode).toBe(200);
    const items = envelope(res).data.items;
    expect(items.length).toBeGreaterThan(1);
    expect(new Set(items.map((r: { workDate: string }) => r.workDate)).size).toBeGreaterThanOrEqual(2);
    const dates = items.map((r: { workDate: string }) => r.workDate);
    for (let i = 1; i < dates.length; i += 1) {
      expect(dates[i - 1] >= dates[i]).toBe(true);
    }
  });

  it('report rows carry leave reason for the detail dialog', async () => {
    const res = await get(
      app,
      `/api/v1/reports/attendance?startDate=${today}&endDateExclusive=${tomorrow}&pageSize=100`,
      admin,
    );
    expect(res.statusCode).toBe(200);
    const items = envelope(res).data.items;
    const withLeave = items.find((r: { leaves: { reason: unknown }[] }) => r.leaves.length > 0);
    expect(withLeave).toBeTruthy();
    expect(withLeave.leaves[0]).toHaveProperty('reason');
    expect(withLeave.leaves[0].reason === null || typeof withLeave.leaves[0].reason === 'string').toBe(true);
  });

  it('leaves list supports the pageSize selector range', async () => {
    const res = await get(app, '/api/v1/leaves?scope=all&status=PENDING&page=1&pageSize=25', admin);
    expect(res.statusCode).toBe(200);
    const body = envelope(res);
    expect(body.data.pagination.pageSize).toBe(25);
    expect(Array.isArray(body.data.items)).toBe(true);
  });
});

describe('Fase 1.5: role CRUD + gabung peserta ke pengguna + filter pengguna', () => {
  const suffix = `${Date.now()}`;
  const roleCode = `ROLE_UJI_CRUD_${suffix}`;
  const testUsername = `uji.crud.${suffix}`;
  let roleId = '';
  let testUserId = '';

  it('role list exposes activeUserCount for each role', async () => {
    const res = await get(app, '/api/v1/admin/access/roles?pageSize=50', bootstrap);
    expect(res.statusCode).toBe(200);
    const items = envelope(res).data.items;
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) expect(item).toHaveProperty('activeUserCount');
    const internRole = items.find((r: { code: string }) => r.code === 'INTERN');
    expect(internRole.activeUserCount).toBeGreaterThan(0);
  });

  it('creates role + user with merged intern profile, then blocks role delete', async () => {
    const db = getDb();
    const bureauOps = await db.bureau.findFirstOrThrow({ where: { code: 'BIO-OPS' } });
    const createdRole = await post(app, '/api/v1/admin/access/roles', bootstrap, {
      code: roleCode,
      name: 'Role Uji CRUD',
    });
    expect(createdRole.statusCode).toBe(200);
    roleId = envelope(createdRole).data.id;

    const created = await post(app, '/api/v1/admin/users', admin, {
      username: testUsername,
      displayName: 'Pengguna Uji CRUD',
      password: DEV_PASSWORD,
      roleIds: [roleId],
      internProfile: {
        participantNumber: `UJI-${suffix}`,
        bureauId: bureauOps.id,
        startDate: today,
      },
    });
    expect(created.statusCode).toBe(200);
    testUserId = envelope(created).data.id;

    const listed = envelope(await get(app, `/api/v1/admin/users?search=${testUsername}`, admin));
    expect(listed.data.items.length).toBe(1);
    expect(listed.data.items[0].internProfile.participantNumber).toBe(`UJI-${suffix}`);
    expect(listed.data.items[0].internProfile.bureau.name).toBe(bureauOps.name);

    const byBureau = envelope(
      await get(app, `/api/v1/admin/users?bureauId=${bureauOps.id}&search=uji.crud`, admin),
    );
    expect(byBureau.data.items.some((u: { username: string }) => u.username === testUsername)).toBe(true);
    const otherBureau = await db.bureau.findFirstOrThrow({ where: { code: { not: 'BIO-OPS' } } });
    const byOther = envelope(
      await get(app, `/api/v1/admin/users?bureauId=${otherBureau.id}&search=uji.crud`, admin),
    );
    expect(byOther.data.items.some((u: { username: string }) => u.username === testUsername)).toBe(false);

    const detail = await get(app, `/api/v1/admin/users/${testUserId}`, admin);
    expect(detail.statusCode).toBe(200);
    expect(envelope(detail).data.internProfile.status).toBe('ACTIVE');

    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/users/${testUserId}`,
      headers: authHeaders(admin),
      payload: { internProfile: { status: 'COMPLETED' } },
    });
    expect(patched.statusCode).toBe(200);
    const after = envelope(await get(app, `/api/v1/admin/users/${testUserId}`, admin));
    expect(after.data.internProfile.status).toBe('COMPLETED');

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/v1/admin/access/roles/${roleId}`,
      headers: authHeaders(bootstrap),
    });
    expect(del.statusCode).toBe(422);
    expect(envelope(del).error?.message).toContain('penugasan');
  });

  it('blocks delete of a system role', async () => {
    const db = getDb();
    const systemRole = await db.role.findFirstOrThrow({ where: { isSystem: true } });
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/admin/access/roles/${systemRole.id}`,
      headers: authHeaders(bootstrap),
    });
    expect(res.statusCode).toBe(422);
    expect(envelope(res).error?.message).toContain('Role sistem');
  });

  it('deletes the role once its assignments are gone', async () => {
    const db = getDb();
    await db.session.deleteMany({ where: { userId: testUserId } });
    await db.internProfile.deleteMany({ where: { userId: testUserId } });
    await db.userRoleAssignment.deleteMany({ where: { userId: testUserId } });
    await db.user.deleteMany({ where: { id: testUserId } });
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/admin/access/roles/${roleId}`,
      headers: authHeaders(bootstrap),
    });
    expect(res.statusCode).toBe(200);
    expect(envelope(res).data.deleted).toBe(true);
    const gone = await db.role.findUnique({ where: { id: roleId } });
    expect(gone).toBeNull();
  });
});

describe('Fase 1.5f: import pengguna via Excel', () => {
  const suffix = `${Date.now()}`;
  let bureauName = '';
  const importedUsernames = [`uji.import.intern.${suffix}`, `uji.import.spv.${suffix}`];

  async function buildImportWorkbook(rows: string[][]): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Pengguna');
    sheet.addRow([
      'Username', 'Nama Lengkap', 'Email', 'No. HP', 'Kode Role', 'Nomor Peserta',
      'Biro', 'Divisi', 'Penempatan', 'Tanggal Mulai (YYYY-MM-DD)', 'Tanggal Selesai (YYYY-MM-DD)', 'Status Peserta',
    ]);
    for (const row of rows) sheet.addRow(row);
    return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer);
  }

  it('template berisi sheet petunjuk, master tersembunyi, dan dropdown', async () => {
    const res = await get(app, '/api/v1/admin/users/import/template', admin);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.rawPayload as unknown as ArrayBuffer);
    const names = wb.worksheets.map((w) => w.name);
    expect(names).toContain('Petunjuk');
    expect(names).toContain('Pengguna');
    const master = wb.getWorksheet('Data Master');
    expect(master?.state).toBe('hidden');
    const pengguna = wb.getWorksheet('Pengguna')!;
    expect(pengguna.getCell('A1').value).toBe('Username');
    expect(pengguna.getCell('E2').dataValidation?.type).toBe('list');
    const db = getDb();
    bureauName = (await db.bureau.findFirstOrThrow({ where: { code: 'BIO-OPS' } })).name;
  });

  it('validate memisahkan baris valid dan error', async () => {
    const buf = await buildImportWorkbook([
      [
        `uji.import.intern.${suffix}`, 'Impor Intern Uji', '', '', 'INTERN', `UJIIMP-${suffix}`,
        bureauName, '', '', today, '', 'AKTIF',
      ],
      [`uji.import.spv.${suffix}`, 'Impor Pembimbing Uji', '', '', 'SUPERVISOR', '', '', '', '', '', '', ''],
      [`uji.import.bad.${suffix}`, 'Impor Gagal', '', '', 'ROLE_TIDAK_ADA', '', '', '', '', '', '', ''],
    ]);
    const mp = buildMultipart({}, { field: 'file', filename: 'import.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', content: buf });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/users/import/validate',
      headers: authHeaders(admin, { 'content-type': mp.contentType }),
      payload: mp.body,
    });
    expect(res.statusCode).toBe(200);
    const data = envelope(res).data;
    expect(data.totalRows).toBe(3);
    expect(data.validCount).toBe(2);
    expect(data.errorCount).toBe(1);
    const bad = data.rows.find((r: { username: string }) => r.username === `uji.import.bad.${suffix}`);
    expect(bad.errors.join(' ')).toContain('tidak ada di daftar');
  });

  it('confirm membuat pengguna + profil + role, password sementara bekerja', async () => {
    const db = getDb();
    const buf = await buildImportWorkbook([
      [
        `uji.import.intern.${suffix}`, 'Impor Intern Uji', '', '', 'INTERN', `UJIIMP-${suffix}`,
        bureauName, '', '', today, '', 'AKTIF',
      ],
      [`uji.import.spv.${suffix}`, 'Impor Pembimbing Uji', '', '', 'SUPERVISOR', '', '', '', '', '', '', ''],
      [`uji.import.bad.${suffix}`, 'Impor Gagal', '', '', 'ROLE_TIDAK_ADA', '', '', '', '', '', '', ''],
    ]);
    const mp = buildMultipart({}, { field: 'file', filename: 'import.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', content: buf });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/users/import/confirm',
      headers: authHeaders(admin, { 'content-type': mp.contentType }),
      payload: mp.body,
    });
    expect(res.statusCode).toBe(200);
    const data = envelope(res).data;
    expect(data.created).toBe(2);
    expect(data.skipped).toBe(1);
    for (const u of data.users) {
      expect(u.username).toContain('uji.import.');
      expect(u.temporaryPassword).toMatch(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*]).{12}$/);
      const dbUser = await db.user.findUniqueOrThrow({ where: { username: u.username } });
      expect(dbUser.mustChangePassword).toBe(true);
      expect(await verifyPassword(dbUser.passwordHash, u.temporaryPassword)).toBe(true);
      importedUsernames.push(u.username);
    }

    const intern = await db.user.findUniqueOrThrow({
      where: { username: `uji.import.intern.${suffix}` },
      include: { internProfile: { include: { bureau: true } }, roleAssignments: { include: { role: true } } },
    });
    expect(intern.internProfile?.participantNumber).toBe(`UJIIMP-${suffix}`);
    expect(intern.internProfile?.bureau.name).toBe(bureauName);
    expect(intern.roleAssignments.some((ra) => ra.role.code === 'INTERN')).toBe(true);
    const spv = await db.user.findUniqueOrThrow({
      where: { username: `uji.import.spv.${suffix}` },
      include: { roleAssignments: { include: { role: true } } },
    });
    expect(spv.internProfile).toBeFalsy();
    expect(spv.roleAssignments.some((ra) => ra.role.code === 'SUPERVISOR')).toBe(true);
  });

  it('impor ulang file yang sama ditolak (username sudah dipakai)', async () => {
    const buf = await buildImportWorkbook([
      [
        `uji.import.intern.${suffix}`, 'Impor Intern Uji', '', '', 'INTERN', `UJIIMP-${suffix}`,
        bureauName, '', '', today, '', 'AKTIF',
      ],
      [`uji.import.spv.${suffix}`, 'Impor Pembimbing Uji', '', '', 'SUPERVISOR', '', '', '', '', '', '', ''],
    ]);
    const mp = buildMultipart({}, { field: 'file', filename: 'import.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', content: buf });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/users/import/confirm',
      headers: authHeaders(admin, { 'content-type': mp.contentType }),
      payload: mp.body,
    });
    expect(res.statusCode).toBe(422);
    expect(envelope(res).error?.message).toContain('Tidak ada baris valid');
  });

  afterAll(async () => {
    const db = getDb();
    const users = await db.user.findMany({ where: { username: { in: importedUsernames } }, select: { id: true } });
    for (const u of users) {
      await db.session.deleteMany({ where: { userId: u.id } });
      await db.internProfile.deleteMany({ where: { userId: u.id } });
      await db.userRoleAssignment.deleteMany({ where: { userId: u.id } });
      await db.user.deleteMany({ where: { id: u.id } });
    }
  });
});

describe('Fase 1.6: pohon permission + template role', () => {
  const suffix = `${Date.now()}`;
  let scratchRoleId = '';

  it('pohon permission memuat seluruh permission DB tanpa kode asing', async () => {
    const db = getDb();
    const res = await get(app, '/api/v1/admin/access/permission-tree', bootstrap);
    expect(res.statusCode).toBe(200);
    const menus = envelope(res).data.menus;
    expect(menus.length).toBeGreaterThan(0);

    const treeCodes = menus.flatMap((m: { submenus: { permissions: { code: string }[] }[] }) =>
      m.submenus.flatMap((s) => s.permissions.map((p) => p.code)),
    );
    const dbCodes = (await db.permission.findMany({ select: { code: true } })).map((p) => p.code);
    expect(new Set(treeCodes).size).toBe(treeCodes.length);
    expect([...treeCodes].sort()).toEqual([...dbCodes].sort());
    expect(menus.some((m: { key: string }) => m.key === 'lainnya')).toBe(false);
  });

  it('daftar template berisi Administrator, Pembimbing, Peserta', async () => {
    const res = await get(app, '/api/v1/admin/access/role-templates', bootstrap);
    expect(res.statusCode).toBe(200);
    const items = envelope(res).data.items;
    expect(items.map((t: { key: string }) => t.key).sort()).toEqual(['administrator', 'pembimbing', 'peserta']);
    const admin = items.find((t: { key: string }) => t.key === 'administrator');
    const pembimbing = items.find((t: { key: string }) => t.key === 'pembimbing');
    expect(admin.permissionCount).toBeGreaterThan(20);
    expect(pembimbing.permissionCount).toBe(7);
  });

  it('apply-template mengganti permission role + audit, guard menolak permission yang tidak dimiliki actor', async () => {
    const db = getDb();
    const created = await post(app, '/api/v1/admin/access/roles', bootstrap, {
      code: `ROLE_UJI_TEMPLATE_${suffix}`,
      name: 'Role Uji Template',
    });
    expect(created.statusCode).toBe(200);
    scratchRoleId = envelope(created).data.id;

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/access/roles/${scratchRoleId}/apply-template`,
      headers: authHeaders(bootstrap),
      payload: { templateKey: 'pembimbing' },
    });
    expect(res.statusCode).toBe(200);
    expect(envelope(res).data.permissionCount).toBe(7);

    const detail = envelope(await get(app, `/api/v1/admin/access/roles/${scratchRoleId}`, bootstrap)).data;
    const allowCodes = detail.permissions
      .filter((p: { effect: string }) => p.effect === 'ALLOW')
      .map((p: { permissionCode: string }) => p.permissionCode)
      .sort();
    expect(allowCodes).toEqual([
      'attendance:evidence:view', 'attendance:view:scoped', 'dashboard:view',
      'help:view', 'leave:view:scoped', 'report:export', 'report:view',
    ]);

    const audit = await db.auditEvent.findFirst({ where: { action: 'ACCESS_ROLE_TEMPLATE_APPLY', objectId: scratchRoleId } });
    expect(audit).not.toBeNull();

    const denied = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/access/roles/${scratchRoleId}/apply-template`,
      headers: authHeaders(bootstrap),
      payload: { templateKey: 'administrator' },
    });
    expect(denied.statusCode).toBe(403);

    const unknown = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/access/roles/${scratchRoleId}/apply-template`,
      headers: authHeaders(bootstrap),
      payload: { templateKey: 'tidak_ada' },
    });
    expect(unknown.statusCode).toBe(400);
  });

  it('menghapus role uji template', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/admin/access/roles/${scratchRoleId}`,
      headers: authHeaders(bootstrap),
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('Fase 3: profil lengkap + edit whitelist kontak', () => {
  const suffix = `${Date.now()}`;
  const internUsername = `uji.profile.${suffix}`;
  let internUserId = '';
  let originalPhone: string | null = null;

  it('GET /profile peserta memuat role, biro, jadwal, dan pembimbing', async () => {
    const db = getDb();
    const bureauOps = await db.bureau.findFirstOrThrow({ where: { code: 'BIO-OPS' } });
    const internRole = await db.role.findFirstOrThrow({ where: { code: 'INTERN' } });
    const supervisorUser = await db.user.findFirstOrThrow({
      where: { username: 'supervisor1' },
      select: { id: true },
    });
    const created = await post(app, '/api/v1/admin/users', admin, {
      username: internUsername,
      displayName: 'Peserta Uji Profil',
      password: DEV_PASSWORD,
      email: `${internUsername}@kcic.test`,
      roleIds: [internRole.id],
      internProfile: {
        participantNumber: `UJI-PRF-${suffix}`,
        bureauId: bureauOps.id,
        startDate: today,
      },
    });
    expect(created.statusCode).toBe(200);
    internUserId = envelope(created).data.id;

    const profile = await db.internProfile.findFirstOrThrow({
      where: { userId: internUserId },
      select: { id: true },
    });
    const assigned = await post(app, '/api/v1/admin/assignments', admin, {
      internProfileId: profile.id,
      supervisorUserId: supervisorUser.id,
      status: 'ACTIVE',
    });
    expect(assigned.statusCode).toBe(200);

    const session = await login(app, internUsername, DEV_PASSWORD);
    const res = await get(app, '/api/v1/profile', session);
    expect(res.statusCode).toBe(200);
    const user = envelope(res).data.user;
    expect(user.roles[0].code).toBe('INTERN');
    expect(user.internProfile.participantNumber).toBe(`UJI-PRF-${suffix}`);
    expect(user.internProfile.bureauName).toBe(bureauOps.name);
    expect(user.internProfile.supervisors.length).toBeGreaterThan(0);
    expect(user.internProfile.supervisors[0].displayName).toBeTruthy();
    expect(user.schedule).not.toBeNull();
    expect(user.schedule.days.length).toBe(7);
  });

  it('PATCH /profile menolak field di luar whitelist (strict)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/profile',
      headers: authHeaders(admin),
      payload: { displayName: 'Admin HR', accountStatus: 'SUSPENDED' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('PATCH /profile menolak email yang dipakai pengguna lain dan telepon tak valid', async () => {
    const db = getDb();
    const adminUser = await db.user.findFirstOrThrow({
      where: { username: 'admin-hr' },
      select: { id: true },
    });
    const other = await db.user.findFirstOrThrow({
      where: { email: { not: null }, id: { not: adminUser.id } },
      select: { email: true },
    });
    const takenEmail = await app.inject({
      method: 'PATCH',
      url: '/api/v1/profile',
      headers: authHeaders(admin),
      payload: { email: other.email },
    });
    expect(takenEmail.statusCode).toBe(409);

    const badPhone = await app.inject({
      method: 'PATCH',
      url: '/api/v1/profile',
      headers: authHeaders(admin),
      payload: { phone: '0812-abc' },
    });
    expect(badPhone.statusCode).toBe(400);

    const goodPhone = await app.inject({
      method: 'PATCH',
      url: '/api/v1/profile',
      headers: authHeaders(admin),
      payload: { phone: '081999999999' },
    });
    expect(goodPhone.statusCode).toBe(200);
    originalPhone = envelope(goodPhone).data.user.phone;
    expect(originalPhone).toBe('081999999999');

    const restore = await app.inject({
      method: 'PATCH',
      url: '/api/v1/profile',
      headers: authHeaders(admin),
      payload: { phone: null },
    });
    expect(restore.statusCode).toBe(200);
    expect(envelope(restore).data.user.phone).toBeNull();
  });
});

describe('Fase 4: feedback error ramah (envelope validasi + 404 Indonesia)', () => {
  it('validasi schema mengembalikan VALIDATION_ERROR bahasa Indonesia + fieldErrors', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/organizations/bureaus',
      headers: authHeaders(admin),
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    const body = envelope(res).error;
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.message).toBe('Permintaan tidak valid.');
    expect((body.fieldErrors?.name as string[] | undefined)?.join(' ')).toContain('Wajib diisi.');

    const tooLong = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/organizations/bureaus',
      headers: authHeaders(admin),
      payload: { code: 'X', name: 'Biro '.repeat(40) },
    });
    expect(tooLong.statusCode).toBe(400);
    expect(((envelope(tooLong).error.fieldErrors?.name as string[] | undefined) ?? []).join(' ')).toContain(
      'Maksimal 128 karakter.',
    );
  });

  it('nama tampilan 200+ karakter memberi fieldErrors per-field berbahasa Indonesia', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/profile',
      headers: authHeaders(p1),
      payload: { displayName: 'Andi Prasetyo '.repeat(15) },
    });
    expect(res.statusCode).toBe(400);
    const body = envelope(res).error;
    expect(body.message).toBe('Permintaan tidak valid.');
    const msgs = body.fieldErrors?.displayName as string[] | undefined;
    expect((msgs ?? []).join(' ')).toContain('Nama tampilan maksimal 128 karakter.');
  });

  it('PATCH pengguna yang tidak ada tetap 404 dengan pesan Indonesia', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/users/${randomUUID()}`,
      headers: authHeaders(admin),
      payload: { displayName: 'Tidak Ada' },
    });
    expect(res.statusCode).toBe(404);
    expect(envelope(res).error.message).toBe('Data tidak ditemukan.');
  });
});

describe('Fase UAT: kontrak list Data Master konsisten (pagination wajib)', () => {
  it('GET /admin/calendar mengembalikan pagination seperti resource master lain', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/calendar',
      headers: authHeaders(admin),
      payload: { calendarDate: '2027-01-01', dayType: 'HOLIDAY', name: 'Tahun Baru Masehi' },
    });
    expect(create.statusCode).toBe(200);

    const list = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/calendar?page=1&pageSize=15',
      headers: authHeaders(admin),
    });
    expect(list.statusCode).toBe(200);
    const body = envelope(list).data as { items: unknown[]; pagination: Record<string, number> };
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.some((item) => (item as { calendarDate: string }).calendarDate.startsWith('2027-01-01'))).toBe(true);
    expect(body.pagination.page).toBe(1);
    expect(body.pagination.pageSize).toBe(15);
    expect(body.pagination.total).toBeGreaterThanOrEqual(1);
    expect(body.pagination.totalPages).toBeGreaterThanOrEqual(1);
  });

  it('GET /admin/calendar memakai filter rentang tanggal', async () => {
    const list = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/calendar?startDate=2026-12-01&endDateExclusive=2027-01-01&page=1&pageSize=15',
      headers: authHeaders(admin),
    });
    expect(list.statusCode).toBe(200);
    const body = envelope(list).data as { items: Array<{ calendarDate: string }> };
    for (const item of body.items) {
      expect(item.calendarDate >= '2026-12-01').toBe(true);
      expect(item.calendarDate < '2027-01-01').toBe(true);
    }
  });
});
