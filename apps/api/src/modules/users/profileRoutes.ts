import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getDb } from '../../infrastructure/db.js';
import { ok } from '../../common/http.js';
import { writeAudit } from '../../common/audit.js';
import { authenticate, requireCtx } from '../../app/auth.js';
import { conflict } from '../../common/errors.js';
import { getActiveScheduleForProfile } from '../schedules/service.js';
import { businessDate } from '../../common/time.js';

// Nomor Indonesia: 08xx / 62-8xx / +62-8xx, total 9-14 digit setelah awalan 8.
export const phoneIdSchema = z
  .string()
  .regex(/^(?:\+62|62|0)8\d{7,12}$/, 'Nomor telepon wajib format nomor Indonesia (mis. 081234567890).');

// Self-service: hanya kontak yang boleh diubah. Field di luar whitelist DITOLAK
// (strict), bukan diam-diam dibuang.
const profilePatchBody = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(1, 'Nama tampilan wajib diisi.')
      .max(128, 'Nama tampilan maksimal 128 karakter.')
      .optional(),
    email: z.string().email('Format email tidak valid.').max(255, 'Email maksimal 255 karakter.').nullable().optional(),
    phone: phoneIdSchema.nullable().optional(),
  })
  .strict();

const SAFE_USER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  email: true,
  phone: true,
  accountStatus: true,
  mustChangePassword: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function profileRoutes(app: FastifyInstance): Promise<void> {
  const db = getDb();

  app.get('/profile', { preHandler: authenticate }, async (req) => {
    const ctx = requireCtx(req);
    const now = new Date();
    const user = await db.user.findUnique({
      where: { id: ctx.user.id },
      select: {
        ...SAFE_USER_SELECT,
        roleAssignments: {
          where: { OR: [{ validTo: null }, { validTo: { gt: now } }] },
          orderBy: { validFrom: 'asc' },
          select: { role: { select: { code: true, name: true } } },
        },
        internProfile: {
          select: {
            id: true,
            participantNumber: true,
            startDate: true,
            endDate: true,
            status: true,
            bureau: { select: { name: true } },
            division: { select: { name: true } },
            placement: { select: { name: true } },
            supervisorAssignments: {
              where: { status: 'ACTIVE', OR: [{ validTo: null }, { validTo: { gte: now } }] },
              select: { supervisor: { select: { id: true, displayName: true, email: true } } },
            },
          },
        },
      },
    });
    if (!user) return ok({ user: null }, req.id);

    const schedule = user.internProfile
      ? await getActiveScheduleForProfile(db, user.internProfile.id, businessDate())
      : null;

    // Tampilkan tiap pembimbing sekali saja meski ada lebih dari satu baris
    // penugasan aktif (mis. sisa data lama sebelum guard duplikat ada).
    const uniqueSupervisors = new Map<string, { displayName: string; email: string | null }>();
    for (const assignment of user.internProfile?.supervisorAssignments ?? []) {
      uniqueSupervisors.set(assignment.supervisor.id, {
        displayName: assignment.supervisor.displayName,
        email: assignment.supervisor.email,
      });
    }

    return ok(
      {
        user: {
          ...user,
          roles: user.roleAssignments.map((r) => r.role),
          internProfile: user.internProfile
            ? {
                participantNumber: user.internProfile.participantNumber,
                startDate: user.internProfile.startDate,
                endDate: user.internProfile.endDate,
                status: user.internProfile.status,
                bureauName: user.internProfile.bureau?.name ?? null,
                divisionName: user.internProfile.division?.name ?? null,
                placementName: user.internProfile.placement?.name ?? null,
                supervisors: [...uniqueSupervisors.values()],
              }
            : null,
          schedule,
        },
      },
      req.id,
    );
  });

  // Users may ONLY change their own contact fields.
  app.patch(
    '/profile',
    { schema: { body: profilePatchBody }, preHandler: authenticate },
    async (req) => {
      const ctx = requireCtx(req);
      const body = profilePatchBody.parse(req.body);
      const data: { displayName?: string; email?: string | null; phone?: string | null } = {};
      if (body.displayName !== undefined) data.displayName = body.displayName;
      if (body.email !== undefined) data.email = body.email;
      if (body.phone !== undefined) data.phone = body.phone;

      if (data.email) {
        const taken = await db.user.findFirst({
          where: { email: { equals: data.email, mode: 'insensitive' }, id: { not: ctx.user.id } },
          select: { id: true },
        });
        if (taken) throw conflict('Email sudah digunakan oleh pengguna lain.');
      }

      const before = await db.user.findUnique({ where: { id: ctx.user.id }, select: SAFE_USER_SELECT });
      const user = await db.user.update({
        where: { id: ctx.user.id },
        data,
        select: SAFE_USER_SELECT,
      });
      await writeAudit(db, {
        actorUserId: ctx.user.id,
        action: 'PROFILE_UPDATE',
        objectType: 'user',
        objectId: ctx.user.id,
        before: before
          ? { displayName: before.displayName, email: before.email, phone: before.phone }
          : undefined,
        after: { displayName: user.displayName, email: user.email, phone: user.phone },
        requestId: req.id,
      });
      return ok({ user }, req.id);
    },
  );
}
