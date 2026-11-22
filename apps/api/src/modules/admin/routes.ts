import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { getDb } from '../../infrastructure/db.js';
import { ok, paginationQuery, paginationMeta, skipTake } from '../../common/http.js';
import { badRequest, notFound, conflict, forbidden, unprocessable } from '../../common/errors.js';
import { writeAudit, redactForAudit } from '../../common/audit.js';
import { parseDateOnly } from '../../common/time.js';
import { authorize, requireCtx } from '../../app/auth.js';
import { adminScopeCovers } from '../access/scope.js';
import type { AccessContext } from '../access/context.js';
import { hashPassword, passwordSchemaMin } from '../auth/password.js';

const idParams = z.object({ id: z.string().uuid() });
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal YYYY-MM-DD');
const dateTimeStr = z.string().datetime();
const genericStatus = z.enum(['ACTIVE', 'INACTIVE']);

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string }).code === 'P2002';
}

function requireGlobalScope(ctx: AccessContext): void {
  if (!ctx.hasGlobalAdminScope) throw forbidden('Operasi ini memerlukan scope admin GLOBAL.');
}

function requireScopeCovers(ctx: AccessContext, target: { bureauId: string | null; divisionId: string | null }): void {
  if (!adminScopeCovers(ctx, target)) throw forbidden();
}

function internProfileScopeWhere(ctx: AccessContext): Prisma.InternProfileWhereInput {
  if (ctx.hasGlobalAdminScope) return {};
  const bureauIds = ctx.adminScopes.filter((s) => s.scopeType === 'BUREAU').map((s) => s.scopeId).filter(Boolean) as string[];
  const divisionIds = ctx.adminScopes.filter((s) => s.scopeType === 'DIVISION').map((s) => s.scopeId).filter(Boolean) as string[];
  const or: Prisma.InternProfileWhereInput[] = [
    ...(bureauIds.length ? [{ bureauId: { in: bureauIds } }] : []),
    ...(divisionIds.length ? [{ divisionId: { in: divisionIds } }] : []),
  ];
  if (or.length === 0) return { id: '__none__' }; // default deny
  return { OR: or };
}

function divisionScopeWhere(ctx: AccessContext): Prisma.DivisionWhereInput {
  if (ctx.hasGlobalAdminScope) return {};
  const bureauIds = ctx.adminScopes.filter((s) => s.scopeType === 'BUREAU').map((s) => s.scopeId).filter(Boolean) as string[];
  const divisionIds = ctx.adminScopes.filter((s) => s.scopeType === 'DIVISION').map((s) => s.scopeId).filter(Boolean) as string[];
  const or: Prisma.DivisionWhereInput[] = [
    ...(bureauIds.length ? [{ bureauId: { in: bureauIds } }] : []),
    ...(divisionIds.length ? [{ id: { in: divisionIds } }] : []),
  ];
  if (or.length === 0) return { id: '__none__' };
  return { OR: or };
}

// ---------- schemas ----------

const bureauCreateBody = z.object({
  code: z.string().min(1).max(32),
  name: z.string().min(1).max(128),
  status: genericStatus.optional(),
});
const bureauPatchBody = z.object({
  code: z.string().min(1).max(32).optional(),
  name: z.string().min(1).max(128).optional(),
  status: genericStatus.optional(),
});
const bureauListQuery = paginationQuery.extend({
  code: z.string().max(32).optional(),
  status: genericStatus.optional(),
});

const divisionCreateBody = z.object({
  bureauId: z.string().uuid(),
  code: z.string().min(1).max(32),
  name: z.string().min(1).max(128),
  status: genericStatus.optional(),
});
const divisionPatchBody = z.object({
  code: z.string().min(1).max(32).optional(),
  name: z.string().min(1).max(128).optional(),
  status: genericStatus.optional(),
});
const divisionListQuery = paginationQuery.extend({
  bureauId: z.string().uuid().optional(),
  status: genericStatus.optional(),
});

const placementCreateBody = z.object({
  code: z.string().min(1).max(32),
  name: z.string().min(1).max(128),
  description: z.string().max(2000).optional(),
  status: genericStatus.optional(),
});
const placementPatchBody = placementCreateBody.partial();
const placementListQuery = paginationQuery.extend({ status: genericStatus.optional() });

const userCreateBody = z.object({
  username: z.string().min(3).max(64),
  displayName: z.string().min(1).max(128),
  password: z.string().min(passwordSchemaMin).max(256),
  email: z.string().email().max(255).optional(),
  phone: z.string().max(32).optional(),
  roleIds: z.array(z.string().uuid()).min(1),
});
const userPatchBody = z.object({
  displayName: z.string().min(1).max(128).optional(),
  email: z.string().email().max(255).nullable().optional(),
  phone: z.string().max(32).nullable().optional(),
  accountStatus: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).optional(),
  mustChangePassword: z.boolean().optional(),
});
const userListQuery = paginationQuery.extend({
  search: z.string().max(128).optional(),
  accountStatus: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).optional(),
});
const userRolesBody = z.object({
  roleIds: z.array(z.string().uuid()).min(1),
  validTo: dateTimeStr.optional(),
});

const internProfileCreateBody = z.object({
  userId: z.string().uuid(),
  participantNumber: z.string().min(1).max(64),
  bureauId: z.string().uuid(),
  divisionId: z.string().uuid().optional(),
  placementId: z.string().uuid().optional(),
  startDate: dateOnly,
  endDate: dateOnly.optional(),
  status: z.enum(['ACTIVE', 'COMPLETED', 'WITHDRAWN']).optional(),
});
const internProfilePatchBody = z.object({
  participantNumber: z.string().min(1).max(64).optional(),
  bureauId: z.string().uuid().optional(),
  divisionId: z.string().uuid().nullable().optional(),
  placementId: z.string().uuid().nullable().optional(),
  startDate: dateOnly.optional(),
  endDate: dateOnly.nullable().optional(),
  status: z.enum(['ACTIVE', 'COMPLETED', 'WITHDRAWN']).optional(),
});
const internProfileListQuery = paginationQuery.extend({
  bureauId: z.string().uuid().optional(),
  divisionId: z.string().uuid().optional(),
  status: z.enum(['ACTIVE', 'COMPLETED', 'WITHDRAWN']).optional(),
});

const assignmentCreateBody = z.object({
  supervisorUserId: z.string().uuid(),
  internProfileId: z.string().uuid(),
  validFrom: dateTimeStr.optional(),
  validTo: dateTimeStr.optional(),
  status: z.enum(['ACTIVE', 'ENDED']),
});
const assignmentPatchBody = z.object({
  validFrom: dateTimeStr.optional(),
  validTo: dateTimeStr.optional(),
  status: z.enum(['ACTIVE', 'ENDED']).optional(),
});
const assignmentListQuery = paginationQuery.extend({
  supervisorUserId: z.string().uuid().optional(),
  internProfileId: z.string().uuid().optional(),
  status: z.enum(['ACTIVE', 'ENDED']).optional(),
});

const scopeCreateBody = z.object({
  userId: z.string().uuid(),
  scopeType: z.enum(['GLOBAL', 'BUREAU', 'DIVISION']),
  scopeId: z.string().uuid().optional(),
  validFrom: dateTimeStr.optional(),
  validTo: dateTimeStr.optional(),
});
const scopePatchBody = z.object({
  validFrom: dateTimeStr.optional(),
  validTo: dateTimeStr.optional(),
});
const scopeListQuery = paginationQuery.extend({ userId: z.string().uuid().optional() });

const leaveCategoryCreateBody = z.object({
  code: z.string().min(1).max(32),
  name: z.string().min(1).max(128),
  sortOrder: z.number().int().min(0).max(1000).optional(),
  status: genericStatus.optional(),
});
const leaveCategoryPatchBody = leaveCategoryCreateBody.partial();
const leaveCategoryListQuery = paginationQuery.extend({ status: genericStatus.optional() });

const businessParameterBody = z.object({
  key: z.string().min(1).max(128),
  valueJson: z.any().refine((v) => v !== undefined, { message: 'valueJson wajib diisi.' }),
  description: z.string().max(2000).optional(),
  validFrom: dateTimeStr.optional(),
  validTo: dateTimeStr.optional(),
});
const businessParameterListQuery = paginationQuery.extend({ key: z.string().max(128).optional() });
const businessParameterKeyParams = z.object({ key: z.string().min(1).max(128) });

/** Data Master must never accept executable code. */
const FORBIDDEN_VALUE_KEYS = new Set(['script', 'sql', 'code']);
function containsForbiddenKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsForbiddenKey);
  if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_VALUE_KEYS.has(k.toLowerCase())) return true;
      if (containsForbiddenKey(v)) return true;
    }
  }
  return false;
}

const USER_SAFE_SELECT = {
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
} satisfies Prisma.UserSelect;

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  const db = getDb();

  // ---------- Bureaus (GLOBAL scope only) ----------

  app.post(
    '/admin/organizations/bureaus',
    { schema: { body: bureauCreateBody }, preHandler: authorize('admin:org:manage') },
    async (req) => {
      const ctx = requireCtx(req);
      requireGlobalScope(ctx);
      const body = bureauCreateBody.parse(req.body);
      let bureau;
      try {
        bureau = await db.bureau.create({ data: body });
      } catch (err) {
        if (isUniqueViolation(err)) throw conflict('Data sudah ada.');
        throw err;
      }
      await writeAudit(db, {
        actorUserId: ctx.user.id,
        action: 'ADMIN_BUREAU_CREATE',
        objectType: 'bureau',
        objectId: bureau.id,
        after: bureau,
        requestId: req.id,
      });
      return ok(bureau, req.id);
    },
  );

  app.get(
    '/admin/organizations/bureaus',
    { schema: { querystring: bureauListQuery }, preHandler: authorize('admin:org:manage') },
    async (req) => {
      const ctx = requireCtx(req);
      requireGlobalScope(ctx);
      const query = bureauListQuery.parse(req.query);
      const where: Prisma.BureauWhereInput = {
        ...(query.code ? { code: { contains: query.code, mode: 'insensitive' } } : {}),
        ...(query.status ? { status: query.status } : {}),
      };
      const [total, items] = await db.$transaction([
        db.bureau.count({ where }),
        db.bureau.findMany({ where, orderBy: { code: 'asc' }, ...skipTake(query) }),
      ]);
      return ok({ items, pagination: paginationMeta(query, total) }, req.id);
    },
  );

  app.get(
    '/admin/organizations/bureaus/:id',
    { schema: { params: idParams }, preHandler: authorize('admin:org:manage') },
    async (req) => {
      const ctx = requireCtx(req);
      requireGlobalScope(ctx);
      const { id } = idParams.parse(req.params);
      const bureau = await db.bureau.findUnique({ where: { id }, include: { divisions: true } });
      if (!bureau) throw notFound();
      return ok(bureau, req.id);
    },
  );

  app.patch(
    '/admin/organizations/bureaus/:id',
    { schema: { params: idParams, body: bureauPatchBody }, preHandler: authorize('admin:org:manage') },
    async (req) => {
      const ctx = requireCtx(req);
      requireGlobalScope(ctx);
      const { id } = idParams.parse(req.params);
      const body = bureauPatchBody.parse(req.body);
      const before = await db.bureau.findUnique({ where: { id } });
      if (!before) throw notFound();
      let bureau;
      try {
        bureau = await db.bureau.update({ where: { id }, data: body });
      } catch (err) {
        if (isUniqueViolation(err)) throw conflict('Data sudah ada.');
        throw err;
      }
      await writeAudit(db, {
        actorUserId: ctx.user.id,
        action: 'ADMIN_BUREAU_UPDATE',
        objectType: 'bureau',
        objectId: id,
        before,
        after: bureau,
        requestId: req.id,
      });
      return ok(bureau, req.id);
    },
  );

  // ---------- Divisions (scoped) ----------

  app.post(
    '/admin/organizations/divisions',
    { schema: { body: divisionCreateBody }, preHandler: authorize('admin:org:manage') },
    async (req) => {
      const ctx = requireCtx(req);
      const body = divisionCreateBody.parse(req.body);
      requireScopeCovers(ctx, { bureauId: body.bureauId, divisionId: null });
      const bureau = await db.bureau.findUnique({ where: { id: body.bureauId } });
      if (!bureau) throw badRequest('Biro tidak ditemukan.');
      let division;
      try {
        division = await db.division.create({ data: body });
      } catch (err) {
        if (isUniqueViolation(err)) throw conflict('Data sudah ada.');
        throw err;
      }
      await writeAudit(db, {
        actorUserId: ctx.user.id,
        action: 'ADMIN_DIVISION_CREATE',
        objectType: 'division',
        objectId: division.id,
        after: division,
        requestId: req.id,
      });
      return ok(division, req.id);
    },
  );

  app.get(
    '/admin/organizations/divisions',
    { schema: { querystring: divisionListQuery }, preHandler: authorize('admin:org:manage') },
    async (req) => {
      const ctx = requireCtx(req);
      const query = divisionListQuery.parse(req.query);
      const where: Prisma.DivisionWhereInput = {
        AND: [
          divisionScopeWhere(ctx),
          {
            ...(query.bureauId ? { bureauId: query.bureauId } : {}),
            ...(query.status ? { status: query.status } : {}),
          },
        ],
      };
      const [total, items] = await db.$transaction([
        db.division.count({ where }),
        db.division.findMany({ where, include: { bureau: true }, orderBy: { code: 'asc' }, ...skipTake(query) }),
      ]);
      return ok({ items, pagination: paginationMeta(query, total) }, req.id);
    },
  );

  app.get(
    '/admin/organizations/divisions/:id',
    { schema: { params: idParams }, preHandler: authorize('admin:org:manage') },
    async (req) => {
      const ctx = requireCtx(req);
      const { id } = idParams.parse(req.params);
      const division = await db.division.findUnique({ where: { id }, include: { bureau: true } });
      if (!division) throw notFound();
      requireScopeCovers(ctx, { bureauId: division.bureauId, divisionId: division.id });
      return ok(division, req.id);
    },
  );

  app.patch(
    '/admin/organizations/divisions/:id',
    { schema: { params: idParams, body: divisionPatchBody }, preHandler: authorize('admin:org:manage') },
    async (req) => {
      const ctx = requireCtx(req);
      const { id } = idParams.parse(req.params);
      const body = divisionPatchBody.parse(req.body);
      const before = await db.division.findUnique({ where: { id } });
      if (!before) throw notFound();
      requireScopeCovers(ctx, { bureauId: before.bureauId, divisionId: before.id });
      let division;
      try {
        division = await db.division.update({ where: { id }, data: body });
      } catch (err) {
        if (isUniqueViolation(err)) throw conflict('Data sudah ada.');
        throw err;
      }
      await writeAudit(db, {
        actorUserId: ctx.user.id,
        action: 'ADMIN_DIVISION_UPDATE',
        objectType: 'division',
        objectId: id,
        before,
        after: division,
        requestId: req.id,
      });
      return ok(division, req.id);
    },
  );

  // ---------- Placements (GLOBAL scope only) ----------

  app.post(
    '/admin/placements',
    { schema: { body: placementCreateBody }, preHandler: authorize('admin:placements:manage') },
    async (req) => {
      const ctx = requireCtx(req);
      requireGlobalScope(ctx);
      const body = placementCreateBody.parse(req.body);
      let placement;
      try {
        placement = await db.placement.create({ data: body });
      } catch (err) {
        if (isUniqueViolation(err)) throw conflict('Data sudah ada.');
        throw err;
      }
      await writeAudit(db, {
        actorUserId: ctx.user.id,
        action: 'ADMIN_PLACEMENT_CREATE',
        objectType: 'placement',
        objectId: placement.id,
        after: placement,
        requestId: req.id,
      });
      return ok(placement, req.id);
    },
  );

  app.get(
    '/admin/placements',
    { schema: { querystring: placementListQuery }, preHandler: authorize('admin:placements:manage') },
    async (req) => {
      const ctx = requireCtx(req);
      requireGlobalScope(ctx);
      const query = placementListQuery.parse(req.query);
      const where: Prisma.PlacementWhereInput = { ...(query.status ? { status: query.status } : {}) };
      const [total, items] = await db.$transaction([
        db.placement.count({ where }),
        db.placement.findMany({ where, orderBy: { code: 'asc' }, ...skipTake(query) }),
      ]);
      return ok({ items, pagination: paginationMeta(query, total) }, req.id);
    },
  );

  app.get(
    '/admin/placements/:id',
    { schema: { params: idParams }, preHandler: authorize('admin:placements:manage') },
    async (req) => {
      const ctx = requireCtx(req);
      requireGlobalScope(ctx);
      const { id } = idParams.parse(req.params);
      const placement = await db.placement.findUnique({ where: { id } });
      if (!placement) throw notFound();
      return ok(placement, req.id);
    },
  );

  app.patch(
    '/admin/placements/:id',
    { schema: { params: idParams, body: placementPatchBody }, preHandler: authorize('admin:placements:manage') },
    async (req) => {
      const ctx = requireCtx(req);
      requireGlobalScope(ctx);
      const { id } = idParams.parse(req.params);
      const body = placementPatchBody.parse(req.body);
      const before = await db.placement.findUnique({ where: { id } });
      if (!before) throw notFound();
      let placement;
      try {
        placement = await db.placement.update({ where: { id }, data: body });
      } catch (err) {
        if (isUniqueViolation(err)) throw conflict('Data sudah ada.');
        throw err;
      }
      await writeAudit(db, {
        actorUserId: ctx.user.id,
        action: 'ADMIN_PLACEMENT_UPDATE',
        objectType: 'placement',
        objectId: id,
        before,
        after: placement,
        requestId: req.id,
      });
      return ok(placement, req.id);
    },
  );

  // ---------- Users (GLOBAL scope only) ----------

  app.post(
    '/admin/users',
    { schema: { body: userCreateBody }, preHandler: authorize('admin:users:manage') },
    async (req) => {
      const ctx = requireCtx(req);
      requireGlobalScope(ctx);
      const body = userCreateBody.parse(req.body);
      const roleCount = await db.role.count({ where: { id: { in: body.roleIds } } });
      if (roleCount !== new Set(body.roleIds).size) throw badRequest('Satu atau lebih role tidak ditemukan.');
      const passwordHash = await hashPassword(body.password);
      let user;
      try {
        user = await db.$transaction(async (tx) => {
          const created = await tx.user.create({
            data: {
              username: body.username,
              displayName: body.displayName,
              passwordHash,
              email: body.email,
              phone: body.phone,
              mustChangePassword: true,
              accountStatus: 'ACTIVE',
              roleAssignments: {
                create: body.roleIds.map((roleId) => ({ roleId, validFrom: new Date(), assignedBy: ctx.user.id })),
              },
            },
            select: USER_SAFE_SELECT,
          });
          await writeAudit(tx as never, {
            actorUserId: ctx.user.id,
            action: 'ADMIN_USER_CREATE',
            objectType: 'user',
            objectId: created.id,
            after: redactForAudit({ ...created, roleIds: body.roleIds }),
            requestId: req.id,
          });
          return created;
        });
      } catch (err) {
        if (isUniqueViolation(err)) throw conflict('Data sudah ada.');
        throw err;
      }
      return ok(user, req.id);
    },
  );

  app.get(
    '/admin/users',
    { schema: { querystring: userListQuery }, preHandler: authorize('admin:users:manage') },
    async (req) => {
      const ctx = requireCtx(req);
      requireGlobalScope(ctx);
      const query = userListQuery.parse(req.query);
      const where: Prisma.UserWhereInput = {
        ...(query.accountStatus ? { accountStatus: query.accountStatus } : {}),
        ...(query.search
          ? {
              OR: [
                { username: { contains: query.search, mode: 'insensitive' } },
                { displayName: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      };
      const [total, items] = await db.$transaction([
        db.user.count({ where }),
        db.user.findMany({
          where,
          select: {
            ...USER_SAFE_SELECT,
            roleAssignments: {
              where: { validFrom: { lte: new Date() }, OR: [{ validTo: null }, { validTo: { gte: new Date() } }] },
              select: { roleId: true, role: { select: { code: true, name: true } } },
            },
          },
          orderBy: { createdAt: 'desc' },
          ...skipTake(query),
        }),
      ]);
      const rows = items.map((u) => ({
        ...u,
        roles: u.roleAssignments.map((ra) => ({ id: ra.roleId, code: ra.role.code, name: ra.role.name })),
      }));
      return ok({ items: rows, pagination: paginationMeta(query, total) }, req.id);
    },
  );

  // Read-only role catalog for the user-management UI.
  // Role governance (create/edit/grants) remains IT-only under /admin/access/*.
  app.get('/admin/roles', { preHandler: authorize('admin:users:manage') }, async (req) => {
    const items = await db.role.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, code: true, name: true, description: true },
      orderBy: { code: 'asc' },
    });
    return ok({ items }, req.id);
  });

  app.get(
    '/admin/users/:id',
    { schema: { params: idParams }, preHandler: authorize('admin:users:manage') },
    async (req) => {
      const ctx = requireCtx(req);
      requireGlobalScope(ctx);
      const { id } = idParams.parse(req.params);
      const user = await db.user.findUnique({
        where: { id },
        select: {
          ...USER_SAFE_SELECT,
          roleAssignments: {
            include: { role: true },
            orderBy: { validFrom: 'desc' },
          },
          internProfile: { select: { id: true, participantNumber: true, status: true } },
        },
      });
      if (!user) throw notFound();
      return ok(user, req.id);
    },
  );

  app.patch(
    '/admin/users/:id',
    { schema: { params: idParams, body: userPatchBody }, preHandler: authorize('admin:users:manage') },
    async (req) => {
      const ctx = requireCtx(req);
      requireGlobalScope(ctx);
      const { id } = idParams.parse(req.params);
      const body = userPatchBody.parse(req.body);
      const before = await db.user.findUnique({ where: { id }, select: USER_SAFE_SELECT });
      if (!before) throw notFound();
      const deactivating =
        body.accountStatus !== undefined &&
        body.accountStatus !== 'ACTIVE' &&
        before.accountStatus !== body.accountStatus;
      const user = await db.$transaction(async (tx) => {
        const updated = await tx.user.update({ where: { id }, data: body, select: USER_SAFE_SELECT });
        if (deactivating) {
          await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
        }
        await writeAudit(tx as never, {
          actorUserId: ctx.user.id,
          action: 'ADMIN_USER_UPDATE',
          objectType: 'user',
          objectId: id,
          before,
          after: updated,
          reason: deactivating ? 'Sesi dicabut karena status akun dinonaktifkan.' : null,
          requestId: req.id,
        });
        return updated;
      });
      return ok(user, req.id);
    },
  );

  app.post(
    '/admin/users/:id/roles',
    { schema: { params: idParams, body: userRolesBody }, preHandler: authorize('admin:users:manage') },
    async (req) => {
      const ctx = requireCtx(req);
      requireGlobalScope(ctx);
      const { id } = idParams.parse(req.params);
      const body = userRolesBody.parse(req.body);
      const user = await db.user.findUnique({ where: { id }, select: { id: true } });
      if (!user) throw notFound('User tidak ditemukan.');
      const roleCount = await db.role.count({ where: { id: { in: body.roleIds } } });
      if (roleCount !== new Set(body.roleIds).size) throw badRequest('Satu atau lebih role tidak ditemukan.');
      const now = new Date();
      const result = await db.$transaction(async (tx) => {
        const oldAssignments = await tx.userRoleAssignment.findMany({
          where: { userId: id, validTo: null },
          include: { role: { select: { code: true } } },
        });
        await tx.userRoleAssignment.updateMany({
          where: { userId: id, validTo: null },
          data: { validTo: now },
        });
        await tx.userRoleAssignment.createMany({
          data: body.roleIds.map((roleId) => ({
            userId: id,
            roleId,
            validFrom: now,
            validTo: body.validTo ? new Date(body.validTo) : null,
            assignedBy: ctx.user.id,
          })),
        });
        await writeAudit(tx as never, {
          actorUserId: ctx.user.id,
          action: 'ADMIN_USER_ROLES_REPLACE',
          objectType: 'user',
          objectId: id,
          before: { roles: oldAssignments.map((a) => a.role.code) },
          after: { roles: body.roleIds },
          requestId: req.id,
        });
        return { replaced: true, roleIds: body.roleIds };
      });
      return ok(result, req.id);
    },
  );

  // ---------- Intern profiles (scoped) ----------

  app.post(
    '/admin/intern-profiles',
    { schema: { body: internProfileCreateBody }, preHandler: authorize('admin:users:manage') },
    async (req) => {
      const ctx = requireCtx(req);
      const body = internProfileCreateBody.parse(req.body);
      requireScopeCovers(ctx, { bureauId: body.bureauId, divisionId: body.divisionId ?? null });
      const user = await db.user.findUnique({
        where: { id: body.userId },
        select: { id: true, internProfile: { select: { id: true } } },
      });
      if (!user) throw badRequest('User tidak ditemukan.');
      if (user.internProfile) throw conflict('User sudah memiliki profil peserta.');
      const bureau = await db.bureau.findUnique({ where: { id: body.bureauId } });
      if (!bureau) throw badRequest('Biro tidak ditemukan.');
      if (body.divisionId) {
        const division = await db.division.findUnique({ where: { id: body.divisionId } });
        if (!division || division.bureauId !== body.bureauId) {
          throw unprocessable('Divisi tidak ditemukan atau tidak berada di bawah biro tersebut.');
        }
      }
      if (body.placementId) {
        const placement = await db.placement.findUnique({ where: { id: body.placementId } });
        if (!placement) throw badRequest('Penempatan tidak ditemukan.');
      }
      if (body.endDate && parseDateOnly(body.endDate) < parseDateOnly(body.startDate)) {
        throw unprocessable('Tanggal berakhir tidak boleh sebelum tanggal mulai.');
      }
      let profile;
      try {
        profile = await db.internProfile.create({
          data: {
            userId: body.userId,
            participantNumber: body.participantNumber,
            bureauId: body.bureauId,
            divisionId: body.divisionId,
            placementId: body.placementId,
            startDate: parseDateOnly(body.startDate),
            endDate: body.endDate ? parseDateOnly(body.endDate) : null,
            status: body.status ?? 'ACTIVE',
          },
          include: { bureau: true, division: true, placement: true },
        });
      } catch (err) {
        if (isUniqueViolation(err)) throw conflict('Data sudah ada.');
        throw err;
      }
      await writeAudit(db, {
        actorUserId: ctx.user.id,
        action: 'ADMIN_INTERN_PROFILE_CREATE',
        objectType: 'internProfile',
        objectId: profile.id,
        after: profile,
        requestId: req.id,
      });
      return ok(profile, req.id);
    },
  );

  app.get(
    '/admin/intern-profiles',
    { schema: { querystring: internProfileListQuery }, preHandler: authorize('admin:users:manage') },
    async (req) => {
      const ctx = requireCtx(req);
      const query = internProfileListQuery.parse(req.query);
      const where: Prisma.InternProfileWhereInput = {
        AND: [
          internProfileScopeWhere(ctx),
          {
            ...(query.bureauId ? { bureauId: query.bureauId } : {}),
            ...(query.divisionId ? { divisionId: query.divisionId } : {}),
            ...(query.status ? { status: query.status } : {}),
          },
        ],
      };
      const [total, items] = await db.$transaction([
        db.internProfile.count({ where }),
        db.internProfile.findMany({
          where,
          include: {
            user: { select: { id: true, username: true, displayName: true } },
            bureau: true,
            division: true,
            placement: true,
          },
          orderBy: { createdAt: 'desc' },
          ...skipTake(query),
        }),
      ]);
      return ok({ items, pagination: paginationMeta(query, total) }, req.id);
    },
  );

  app.get(
    '/admin/intern-profiles/:id',
    { schema: { params: idParams }, preHandler: authorize('admin:users:manage') },
    async (req) => {
      const ctx = requireCtx(req);
      const { id } = idParams.parse(req.params);
      const profile = await db.internProfile.findUnique({
        where: { id },
        include: {
          user: { select: USER_SAFE_SELECT },
          bureau: true,
          division: true,
          placement: true,
          supervisorAssignments: { include: { supervisor: { select: { id: true, displayName: true } } } },
        },
      });
      if (!profile) throw notFound();
      requireScopeCovers(ctx, { bureauId: profile.bureauId, divisionId: profile.divisionId });
      return ok(profile, req.id);
    },
  );

  app.patch(
    '/admin/intern-profiles/:id',
    { schema: { params: idParams, body: internProfilePatchBody }, preHandler: authorize('admin:users:manage') },
    async (req) => {
      const ctx = requireCtx(req);
      const { id } = idParams.parse(req.params);
      const body = internProfilePatchBody.parse(req.body);
      const before = await db.internProfile.findUnique({ where: { id } });
      if (!before) throw notFound();
      const nextBureauId = body.bureauId ?? before.bureauId;
      const nextDivisionId = body.divisionId !== undefined ? body.divisionId : before.divisionId;
      requireScopeCovers(ctx, { bureauId: nextBureauId, divisionId: nextDivisionId });
      if (body.bureauId) {
        const bureau = await db.bureau.findUnique({ where: { id: body.bureauId } });
        if (!bureau) throw badRequest('Biro tidak ditemukan.');
      }
      if (nextDivisionId) {
        const division = await db.division.findUnique({ where: { id: nextDivisionId } });
        if (!division || division.bureauId !== nextBureauId) {
          throw unprocessable('Divisi tidak ditemukan atau tidak berada di bawah biro tersebut.');
        }
      }
      if (body.placementId) {
        const placement = await db.placement.findUnique({ where: { id: body.placementId } });
        if (!placement) throw badRequest('Penempatan tidak ditemukan.');
      }
      let profile;
      try {
        profile = await db.internProfile.update({
          where: { id },
          data: {
            ...(body.participantNumber !== undefined ? { participantNumber: body.participantNumber } : {}),
            ...(body.bureauId !== undefined ? { bureauId: body.bureauId } : {}),
            ...(body.divisionId !== undefined ? { divisionId: body.divisionId } : {}),
            ...(body.placementId !== undefined ? { placementId: body.placementId } : {}),
            ...(body.startDate !== undefined ? { startDate: parseDateOnly(body.startDate) } : {}),
            ...(body.endDate !== undefined ? { endDate: body.endDate === null ? null : parseDateOnly(body.endDate) } : {}),
            ...(body.status !== undefined ? { status: body.status } : {}),
          },
        });
      } catch (err) {
        if (isUniqueViolation(err)) throw conflict('Data sudah ada.');
        throw err;
      }
      await writeAudit(db, {
        actorUserId: ctx.user.id,
        action: 'ADMIN_INTERN_PROFILE_UPDATE',
        objectType: 'internProfile',
        objectId: id,
        before,
        after: profile,
        requestId: req.id,
      });
      return ok(profile, req.id);
    },
  );

  // ---------- Supervisor assignments (scoped by target profile) ----------

  app.post(
    '/admin/assignments',
    { schema: { body: assignmentCreateBody }, preHandler: authorize('admin:assignments:manage') },
    async (req) => {
      const ctx = requireCtx(req);
      const body = assignmentCreateBody.parse(req.body);
      const profile = await db.internProfile.findUnique({
        where: { id: body.internProfileId },
        select: { id: true, bureauId: true, divisionId: true },
      });
      if (!profile) throw badRequest('Profil peserta tidak ditemukan.');
      requireScopeCovers(ctx, { bureauId: profile.bureauId, divisionId: profile.divisionId });
      const supervisor = await db.user.findUnique({ where: { id: body.supervisorUserId }, select: { id: true } });
      if (!supervisor) throw badRequest('User pembimbing tidak ditemukan.');
      const assignment = await db.supervisorAssignment.create({
        data: {
          supervisorUserId: body.supervisorUserId,
          internProfileId: body.internProfileId,
          validFrom: body.validFrom ? new Date(body.validFrom) : new Date(),
          validTo: body.validTo ? new Date(body.validTo) : null,
          status: body.status,
          createdBy: ctx.user.id,
        },
        include: {
          supervisor: { select: { id: true, displayName: true } },
          internProfile: { select: { id: true, participantNumber: true } },
        },
      });
      await writeAudit(db, {
        actorUserId: ctx.user.id,
        action: 'ADMIN_ASSIGNMENT_CREATE',
        objectType: 'supervisorAssignment',
        objectId: assignment.id,
        after: assignment,
        requestId: req.id,
      });
      return ok(assignment, req.id);
    },
  );

  app.get(
    '/admin/assignments',
    { schema: { querystring: assignmentListQuery }, preHandler: authorize('admin:assignments:manage') },
    async (req) => {
      const ctx = requireCtx(req);
      const query = assignmentListQuery.parse(req.query);
      const where: Prisma.SupervisorAssignmentWhereInput = {
        ...(query.supervisorUserId ? { supervisorUserId: query.supervisorUserId } : {}),
        ...(query.internProfileId ? { internProfileId: query.internProfileId } : {}),
        ...(query.status ? { status: query.status } : {}),
        internProfile: internProfileScopeWhere(ctx),
      };
      const [total, items] = await db.$transaction([
        db.supervisorAssignment.count({ where }),
        db.supervisorAssignment.findMany({
          where,
          include: {
            supervisor: { select: { id: true, displayName: true } },
            internProfile: {
              select: {
                id: true,
                participantNumber: true,
                user: { select: { id: true, displayName: true } },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          ...skipTake(query),
        }),
      ]);
      return ok({ items, pagination: paginationMeta(query, total) }, req.id);
    },
  );

  app.get(
    '/admin/assignments/:id',
    { schema: { params: idParams }, preHandler: authorize('admin:assignments:manage') },
    async (req) => {
      const ctx = requireCtx(req);
      const { id } = idParams.parse(req.params);
      const assignment = await db.supervisorAssignment.findUnique({
        where: { id },
        include: {
          supervisor: { select: { id: true, displayName: true } },
          internProfile: { select: { id: true, participantNumber: true, bureauId: true, divisionId: true } },
        },
      });
      if (!assignment) throw notFound();
      requireScopeCovers(ctx, {
        bureauId: assignment.internProfile.bureauId,
        divisionId: assignment.internProfile.divisionId,
      });
      return ok(assignment, req.id);
    },
  );

  app.patch(
    '/admin/assignments/:id',
    { schema: { params: idParams, body: assignmentPatchBody }, preHandler: authorize('admin:assignments:manage') },
    async (req) => {
      const ctx = requireCtx(req);
      const { id } = idParams.parse(req.params);
      const body = assignmentPatchBody.parse(req.body);
      const before = await db.supervisorAssignment.findUnique({
        where: { id },
        include: { internProfile: { select: { bureauId: true, divisionId: true } } },
      });
      if (!before) throw notFound();
      requireScopeCovers(ctx, {
        bureauId: before.internProfile.bureauId,
        divisionId: before.internProfile.divisionId,
      });
      const ending = body.status === 'ENDED';
      const assignment = await db.supervisorAssignment.update({
        where: { id },
        data: {
          ...(body.validFrom !== undefined ? { validFrom: new Date(body.validFrom) } : {}),
          ...(body.validTo !== undefined ? { validTo: new Date(body.validTo) } : {}),
          ...(body.status !== undefined ? { status: body.status } : {}),
          ...(ending && body.validTo === undefined ? { validTo: new Date() } : {}),
        },
        include: { internProfile: { select: { id: true, bureauId: true, divisionId: true } } },
      });
      await writeAudit(db, {
        actorUserId: ctx.user.id,
        action: 'ADMIN_ASSIGNMENT_UPDATE',
        objectType: 'supervisorAssignment',
        objectId: id,
        before: { validFrom: before.validFrom, validTo: before.validTo, status: before.status },
        after: { validFrom: assignment.validFrom, validTo: assignment.validTo, status: assignment.status },
        requestId: req.id,
      });
      return ok(assignment, req.id);
    },
  );

  // ---------- Admin scopes (GLOBAL scope only) ----------

  app.post(
    '/admin/scopes',
    { schema: { body: scopeCreateBody }, preHandler: authorize('access:scopes:manage') },
    async (req) => {
      const ctx = requireCtx(req);
      requireGlobalScope(ctx);
      const body = scopeCreateBody.parse(req.body);
      if (body.scopeType !== 'GLOBAL' && !body.scopeId) {
        throw badRequest('scopeId wajib diisi untuk scope BUREAU atau DIVISION.');
      }
      const user = await db.user.findUnique({ where: { id: body.userId }, select: { id: true } });
      if (!user) throw badRequest('User tidak ditemukan.');
      if (body.scopeType === 'BUREAU' && body.scopeId) {
        const bureau = await db.bureau.findUnique({ where: { id: body.scopeId } });
        if (!bureau) throw badRequest('Biro tidak ditemukan.');
      }
      if (body.scopeType === 'DIVISION' && body.scopeId) {
        const division = await db.division.findUnique({ where: { id: body.scopeId } });
        if (!division) throw badRequest('Divisi tidak ditemukan.');
      }
      const scope = await db.adminScope.create({
        data: {
          userId: body.userId,
          scopeType: body.scopeType,
          scopeId: body.scopeType === 'GLOBAL' ? null : body.scopeId,
          validFrom: body.validFrom ? new Date(body.validFrom) : new Date(),
          validTo: body.validTo ? new Date(body.validTo) : null,
        },
      });
      await writeAudit(db, {
        actorUserId: ctx.user.id,
        action: 'ADMIN_SCOPE_CREATE',
        objectType: 'adminScope',
        objectId: scope.id,
        after: scope,
        requestId: req.id,
      });
      return ok(scope, req.id);
    },
  );

  app.get(
    '/admin/scopes',
    { schema: { querystring: scopeListQuery }, preHandler: authorize('access:scopes:manage') },
    async (req) => {
      const ctx = requireCtx(req);
      requireGlobalScope(ctx);
      const query = scopeListQuery.parse(req.query);
      const where: Prisma.AdminScopeWhereInput = { ...(query.userId ? { userId: query.userId } : {}) };
      const [total, items] = await db.$transaction([
        db.adminScope.count({ where }),
        db.adminScope.findMany({
          where,
          include: { user: { select: { id: true, username: true, displayName: true } } },
          orderBy: { createdAt: 'desc' },
          ...skipTake(query),
        }),
      ]);
      return ok({ items, pagination: paginationMeta(query, total) }, req.id);
    },
  );

  app.get(
    '/admin/scopes/:id',
    { schema: { params: idParams }, preHandler: authorize('access:scopes:manage') },
    async (req) => {
      const ctx = requireCtx(req);
      requireGlobalScope(ctx);
      const { id } = idParams.parse(req.params);
      const scope = await db.adminScope.findUnique({
        where: { id },
        include: { user: { select: { id: true, username: true, displayName: true } } },
      });
      if (!scope) throw notFound();
      return ok(scope, req.id);
    },
  );

  app.patch(
    '/admin/scopes/:id',
    { schema: { params: idParams, body: scopePatchBody }, preHandler: authorize('access:scopes:manage') },
    async (req) => {
      const ctx = requireCtx(req);
      requireGlobalScope(ctx);
      const { id } = idParams.parse(req.params);
      const body = scopePatchBody.parse(req.body);
      const before = await db.adminScope.findUnique({ where: { id } });
      if (!before) throw notFound();
      const scope = await db.adminScope.update({
        where: { id },
        data: {
          ...(body.validFrom !== undefined ? { validFrom: new Date(body.validFrom) } : {}),
          ...(body.validTo !== undefined ? { validTo: new Date(body.validTo) } : {}),
        },
      });
      await writeAudit(db, {
        actorUserId: ctx.user.id,
        action: 'ADMIN_SCOPE_UPDATE',
        objectType: 'adminScope',
        objectId: id,
        before,
        after: scope,
        requestId: req.id,
      });
      return ok(scope, req.id);
    },
  );

  // ---------- Leave categories ----------

  app.post(
    '/admin/leave-categories',
    { schema: { body: leaveCategoryCreateBody }, preHandler: authorize('admin:leave-categories:manage') },
    async (req) => {
      const ctx = requireCtx(req);
      const body = leaveCategoryCreateBody.parse(req.body);
      let category;
      try {
        category = await db.leaveCategory.create({ data: body });
      } catch (err) {
        if (isUniqueViolation(err)) throw conflict('Data sudah ada.');
        throw err;
      }
      await writeAudit(db, {
        actorUserId: ctx.user.id,
        action: 'ADMIN_LEAVE_CATEGORY_CREATE',
        objectType: 'leaveCategory',
        objectId: category.id,
        after: category,
        requestId: req.id,
      });
      return ok(category, req.id);
    },
  );

  app.get(
    '/admin/leave-categories',
    { schema: { querystring: leaveCategoryListQuery }, preHandler: authorize('admin:leave-categories:manage') },
    async (req) => {
      const query = leaveCategoryListQuery.parse(req.query);
      const where: Prisma.LeaveCategoryWhereInput = { ...(query.status ? { status: query.status } : {}) };
      const [total, items] = await db.$transaction([
        db.leaveCategory.count({ where }),
        db.leaveCategory.findMany({ where, orderBy: { sortOrder: 'asc' }, ...skipTake(query) }),
      ]);
      return ok({ items, pagination: paginationMeta(query, total) }, req.id);
    },
  );

  app.get(
    '/admin/leave-categories/:id',
    { schema: { params: idParams }, preHandler: authorize('admin:leave-categories:manage') },
    async (req) => {
      const { id } = idParams.parse(req.params);
      const category = await db.leaveCategory.findUnique({ where: { id } });
      if (!category) throw notFound();
      return ok(category, req.id);
    },
  );

  app.patch(
    '/admin/leave-categories/:id',
    { schema: { params: idParams, body: leaveCategoryPatchBody }, preHandler: authorize('admin:leave-categories:manage') },
    async (req) => {
      const ctx = requireCtx(req);
      const { id } = idParams.parse(req.params);
      const body = leaveCategoryPatchBody.parse(req.body);
      const before = await db.leaveCategory.findUnique({ where: { id } });
      if (!before) throw notFound();
      let category;
      try {
        category = await db.leaveCategory.update({ where: { id }, data: body });
      } catch (err) {
        if (isUniqueViolation(err)) throw conflict('Data sudah ada.');
        throw err;
      }
      await writeAudit(db, {
        actorUserId: ctx.user.id,
        action: 'ADMIN_LEAVE_CATEGORY_UPDATE',
        objectType: 'leaveCategory',
        objectId: id,
        before,
        after: category,
        requestId: req.id,
      });
      return ok(category, req.id);
    },
  );

  // ---------- Business parameters (upsert-style, no executable code) ----------

  app.post(
    '/admin/business-parameters',
    { schema: { body: businessParameterBody }, preHandler: authorize('admin:params:manage') },
    async (req) => {
      const ctx = requireCtx(req);
      const body = businessParameterBody.parse(req.body);
      if (containsForbiddenKey(body.valueJson)) {
        throw unprocessable('Data Master tidak boleh menerima nilai dengan key script/sql/code.');
      }
      const valueJson = body.valueJson as Prisma.InputJsonValue;
      const existing = await db.businessParameter.findUnique({ where: { key: body.key } });
      const param = existing
        ? await db.businessParameter.update({
            where: { id: existing.id },
            data: {
              valueJson,
              description: body.description ?? existing.description,
              validFrom: body.validFrom ? new Date(body.validFrom) : existing.validFrom,
              validTo: body.validTo ? new Date(body.validTo) : existing.validTo,
              updatedById: ctx.user.id,
              version: { increment: 1 },
            },
          })
        : await db.businessParameter.create({
            data: {
              key: body.key,
              valueJson,
              description: body.description,
              validFrom: body.validFrom ? new Date(body.validFrom) : null,
              validTo: body.validTo ? new Date(body.validTo) : null,
              updatedById: ctx.user.id,
            },
          });
      await writeAudit(db, {
        actorUserId: ctx.user.id,
        action: existing ? 'ADMIN_BUSINESS_PARAMETER_UPDATE' : 'ADMIN_BUSINESS_PARAMETER_CREATE',
        objectType: 'businessParameter',
        objectId: param.id,
        before: existing ?? undefined,
        after: param,
        requestId: req.id,
      });
      return ok(param, req.id);
    },
  );

  app.get(
    '/admin/business-parameters',
    { schema: { querystring: businessParameterListQuery }, preHandler: authorize('admin:params:manage') },
    async (req) => {
      const query = businessParameterListQuery.parse(req.query);
      const where: Prisma.BusinessParameterWhereInput = {
        ...(query.key ? { key: { contains: query.key, mode: 'insensitive' } } : {}),
      };
      const [total, items] = await db.$transaction([
        db.businessParameter.count({ where }),
        db.businessParameter.findMany({ where, orderBy: { key: 'asc' }, ...skipTake(query) }),
      ]);
      return ok({ items, pagination: paginationMeta(query, total) }, req.id);
    },
  );

  app.get(
    '/admin/business-parameters/:key',
    { schema: { params: businessParameterKeyParams }, preHandler: authorize('admin:params:manage') },
    async (req) => {
      const { key } = businessParameterKeyParams.parse(req.params);
      const param = await db.businessParameter.findUnique({ where: { key } });
      if (!param) throw notFound();
      return ok(param, req.id);
    },
  );
}
