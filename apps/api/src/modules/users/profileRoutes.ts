import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getDb } from '../../infrastructure/db.js';
import { ok } from '../../common/http.js';
import { writeAudit } from '../../common/audit.js';
import { authenticate, requireCtx } from '../../app/auth.js';

const profilePatchBody = z.object({
  displayName: z.string().min(1).max(128).optional(),
  email: z.string().email().max(255).nullable().optional(),
  phone: z.string().max(32).nullable().optional(),
});

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
    const user = await db.user.findUnique({
      where: { id: ctx.user.id },
      select: {
        ...SAFE_USER_SELECT,
        internProfile: {
          include: {
            bureau: { select: { id: true, code: true, name: true } },
            division: { select: { id: true, code: true, name: true } },
            placement: { select: { id: true, code: true, name: true } },
          },
        },
      },
    });
    return ok({ user }, req.id);
  });

  // Users may ONLY change their own contact fields.
  app.patch(
    '/profile',
    { schema: { body: profilePatchBody }, preHandler: authenticate },
    async (req) => {
      const ctx = requireCtx(req);
      const body = profilePatchBody.parse(req.body);
      const before = await db.user.findUnique({ where: { id: ctx.user.id }, select: SAFE_USER_SELECT });
      const user = await db.user.update({
        where: { id: ctx.user.id },
        data: body,
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
