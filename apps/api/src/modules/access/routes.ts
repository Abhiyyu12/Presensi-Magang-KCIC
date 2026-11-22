import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { getDb } from '../../infrastructure/db.js';
import { ok, paginationQuery, paginationMeta, skipTake } from '../../common/http.js';
import { badRequest, forbidden, notFound, conflict, unprocessable } from '../../common/errors.js';
import { writeAudit } from '../../common/audit.js';
import { authenticate, authorize, requireCtx } from '../../app/auth.js';
import { hasPermission, loadAccessContext } from './context.js';

const idParams = z.object({ id: z.string().uuid() });
const genericStatus = z.enum(['ACTIVE', 'INACTIVE']);
const effectSchema = z.enum(['ALLOW', 'DENY']);

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string }).code === 'P2002';
}

// ---------- schemas ----------

const roleCreateBody = z.object({
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(128),
  description: z.string().max(2000).optional(),
});
const rolePatchBody = z.object({
  name: z.string().min(1).max(128).optional(),
  description: z.string().max(2000).nullable().optional(),
  status: genericStatus.optional(),
});
const roleListQuery = paginationQuery.extend({ status: genericStatus.optional() });

const rolePermissionsBody = z.object({
  entries: z.array(z.object({ permissionCode: z.string().min(1).max(128), effect: effectSchema })).max(500),
});

const permissionListQuery = paginationQuery.extend({ module: z.string().max(64).optional() });

const featureNodeBody = z.object({
  parentId: z.string().uuid().optional(),
  code: z.string().min(1).max(128),
  label: z.string().min(1).max(128),
  route: z.string().max(255).optional(),
  nodeType: z.enum(['GROUP', 'PAGE', 'ACTION']),
  requiredPermissionCode: z.string().max(128).optional(),
  sortOrder: z.number().int().min(0).max(100000).optional(),
});
const featureNodePatchBody = z.object({
  parentId: z.string().uuid().nullable().optional(),
  label: z.string().min(1).max(128).optional(),
  route: z.string().max(255).nullable().optional(),
  nodeType: z.enum(['GROUP', 'PAGE', 'ACTION']).optional(),
  requiredPermissionCode: z.string().max(128).nullable().optional(),
  sortOrder: z.number().int().min(0).max(100000).optional(),
});

const CONDITION_SUBJECTS = new Set(['roleCodes', 'adminScopeTypes', 'accountStatus', 'isIntern']);
const CONDITION_OPS = new Set(['includes', 'equals', 'notEquals']);

const conditionAtomSchema = z.object({
  subject: z.string(),
  op: z.string(),
  value: z.union([z.string(), z.boolean()]),
});
const conditionSchema = z
  .object({
    all: z.array(conditionAtomSchema).optional(),
    any: z.array(conditionAtomSchema).optional(),
    not: conditionAtomSchema.optional(),
  })
  .passthrough();

function validateConditionJson(raw: unknown): Prisma.InputJsonObject {
  const parsed = conditionSchema.safeParse(raw);
  if (!parsed.success) throw unprocessable('conditionJson tidak valid.');
  const atoms = [...(parsed.data.all ?? []), ...(parsed.data.any ?? []), ...(parsed.data.not ? [parsed.data.not] : [])];
  for (const atom of atoms) {
    if (!CONDITION_SUBJECTS.has(atom.subject)) {
      throw unprocessable(`Subject kondisi tidak dikenal: ${atom.subject}`);
    }
    if (!CONDITION_OPS.has(atom.op)) {
      throw unprocessable(`Operator kondisi tidak dikenal: ${atom.op}`);
    }
  }
  return parsed.data as unknown as Prisma.InputJsonObject;
}

const policyCreateBody = z.object({
  code: z.string().min(1).max(128),
  permissionCode: z.string().min(1).max(128),
  effect: effectSchema,
  conditionJson: z.any(),
  description: z.string().max(2000).optional(),
});
const policyPatchBody = z.object({
  status: genericStatus.optional(),
  conditionJson: z.any().optional(),
  effect: effectSchema.optional(),
});
const policyListQuery = paginationQuery.extend({ permissionCode: z.string().max(128).optional() });

const simulateQuery = z.object({
  userId: z.string().uuid(),
  permissionCode: z.string().min(1).max(128),
});

// ---------- feature tree assembly ----------

interface FeatureTreeNode {
  id: string;
  parentId: string | null;
  code: string;
  label: string;
  route: string | null;
  nodeType: string;
  requiredPermissionCode: string | null;
  sortOrder: number;
  children: FeatureTreeNode[];
}

function buildFeatureTree(rows: Omit<FeatureTreeNode, 'children'>[]): FeatureTreeNode[] {
  const nodes = new Map<string, FeatureTreeNode>();
  for (const row of rows) nodes.set(row.id, { ...row, children: [] });
  const roots: FeatureTreeNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

export async function accessRoutes(app: FastifyInstance): Promise<void> {
  const db = getDb();

  // ---------- Effective access for current user ----------

  app.get('/access/me/effective', { preHandler: authenticate }, async (req) => {
    const ctx = requireCtx(req);
    const allNodes = await db.featureNode.findMany({ orderBy: { sortOrder: 'asc' } });
    const visible = allNodes
      .filter((n) => n.requiredPermissionCode === null || hasPermission(ctx, n.requiredPermissionCode))
      .map((n) => ({
        id: n.id,
        parentId: n.parentId,
        code: n.code,
        label: n.label,
        route: n.route,
        nodeType: n.nodeType,
        requiredPermissionCode: n.requiredPermissionCode,
        sortOrder: n.sortOrder,
      }));
    return ok(
      {
        roles: ctx.roleCodes,
        permissions: [...ctx.permissions].sort(),
        denied: [...ctx.denied].sort(),
        featureTree: buildFeatureTree(visible),
      },
      req.id,
    );
  });

  // ---------- Roles ----------

  app.get(
    '/admin/access/roles',
    { schema: { querystring: roleListQuery }, preHandler: authorize('access:roles:manage') },
    async (req) => {
      const query = roleListQuery.parse(req.query);
      const where: Prisma.RoleWhereInput = { ...(query.status ? { status: query.status } : {}) };
      const [total, items] = await db.$transaction([
        db.role.count({ where }),
        db.role.findMany({
          where,
          include: { rolePermissions: { include: { permission: true } } },
          orderBy: { code: 'asc' },
          ...skipTake(query),
        }),
      ]);
      return ok({ items, pagination: paginationMeta(query, total) }, req.id);
    },
  );

  app.get(
    '/admin/access/roles/:id',
    { schema: { params: idParams }, preHandler: authorize('access:roles:manage') },
    async (req) => {
      const { id } = idParams.parse(req.params);
      const role = await db.role.findUnique({
        where: { id },
        include: { rolePermissions: { include: { permission: true } } },
      });
      if (!role) throw notFound();
      const { rolePermissions, ...rest } = role;
      return ok(
        {
          ...rest,
          permissions: rolePermissions.map((rp) => ({ permissionCode: rp.permission.code, effect: rp.effect })),
        },
        req.id,
      );
    },
  );

  app.post(
    '/admin/access/roles',
    { schema: { body: roleCreateBody }, preHandler: authorize('access:roles:manage') },
    async (req) => {
      const ctx = requireCtx(req);
      const body = roleCreateBody.parse(req.body);
      let role;
      try {
        // New roles always start with ZERO permissions.
        role = await db.role.create({ data: body });
      } catch (err) {
        if (isUniqueViolation(err)) throw conflict('Data sudah ada.');
        throw err;
      }
      await writeAudit(db, {
        actorUserId: ctx.user.id,
        action: 'ACCESS_ROLE_CREATE',
        objectType: 'role',
        objectId: role.id,
        after: role,
        requestId: req.id,
      });
      return ok(role, req.id);
    },
  );

  app.patch(
    '/admin/access/roles/:id',
    { schema: { params: idParams, body: rolePatchBody }, preHandler: authorize('access:roles:manage') },
    async (req) => {
      const ctx = requireCtx(req);
      const { id } = idParams.parse(req.params);
      const body = rolePatchBody.parse(req.body);
      const before = await db.role.findUnique({ where: { id } });
      if (!before) throw notFound();
      if (before.isSystem && body.status !== undefined && body.status !== before.status) {
        throw unprocessable('Role sistem tidak dapat mengubah status.');
      }
      const role = await db.role.update({ where: { id }, data: body });
      await writeAudit(db, {
        actorUserId: ctx.user.id,
        action: 'ACCESS_ROLE_UPDATE',
        objectType: 'role',
        objectId: id,
        before,
        after: role,
        requestId: req.id,
      });
      return ok(role, req.id);
    },
  );

  app.put(
    '/admin/access/roles/:id/permissions',
    { schema: { params: idParams, body: rolePermissionsBody }, preHandler: authorize('access:roles:manage') },
    async (req) => {
      const ctx = requireCtx(req);
      const { id } = idParams.parse(req.params);
      const body = rolePermissionsBody.parse(req.body);
      const role = await db.role.findUnique({ where: { id } });
      if (!role) throw notFound();
      // GUARD: actor may only grant permissions they themselves hold.
      for (const entry of body.entries) {
        if (entry.effect === 'ALLOW' && !ctx.permissions.has(entry.permissionCode)) {
          throw forbidden('Tidak dapat memberikan permission yang tidak Anda miliki');
        }
      }
      const codes = [...new Set(body.entries.map((e) => e.permissionCode))];
      if (codes.length !== body.entries.length) throw badRequest('Terdapat duplikasi permissionCode pada entries.');
      const permissions = await db.permission.findMany({ where: { code: { in: codes } } });
      if (permissions.length !== codes.length) throw badRequest('Satu atau lebih permission tidak ditemukan.');
      const permissionIdByCode = new Map(permissions.map((p) => [p.code, p.id]));
      const result = await db.$transaction(async (tx) => {
        const beforeEntries = await tx.rolePermission.findMany({
          where: { roleId: id },
          include: { permission: { select: { code: true } } },
        });
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        if (body.entries.length > 0) {
          await tx.rolePermission.createMany({
            data: body.entries.map((e) => ({
              roleId: id,
              permissionId: permissionIdByCode.get(e.permissionCode)!,
              effect: e.effect,
            })),
          });
        }
        await writeAudit(tx as never, {
          actorUserId: ctx.user.id,
          action: 'ACCESS_ROLE_PERMISSIONS_REPLACE',
          objectType: 'role',
          objectId: id,
          before: beforeEntries.map((rp) => ({ permissionCode: rp.permission.code, effect: rp.effect })),
          after: body.entries,
          requestId: req.id,
        });
        return { replaced: true, entries: body.entries };
      });
      return ok(result, req.id);
    },
  );

  // ---------- Permissions ----------

  app.get('/admin/access/permissions', { schema: { querystring: permissionListQuery }, preHandler: authenticate }, async (req) => {
    const ctx = requireCtx(req);
    if (!hasPermission(ctx, 'access:roles:manage') && !hasPermission(ctx, 'access:permissions:view')) {
      throw forbidden();
    }
    const query = permissionListQuery.parse(req.query);
    const where: Prisma.PermissionWhereInput = { ...(query.module ? { module: query.module } : {}) };
    const [total, items] = await db.$transaction([
      db.permission.count({ where }),
      db.permission.findMany({ where, orderBy: { code: 'asc' }, ...skipTake(query) }),
    ]);
    return ok({ items, pagination: paginationMeta(query, total) }, req.id);
  });

  // ---------- Feature tree ----------

  app.get(
    '/admin/access/feature-tree',
    { preHandler: authorize('access:feature-tree:manage') },
    async (req) => {
      const nodes = await db.featureNode.findMany({ orderBy: { sortOrder: 'asc' } });
      return ok(
        {
          items: nodes,
          tree: buildFeatureTree(
            nodes.map((n) => ({
              id: n.id,
              parentId: n.parentId,
              code: n.code,
              label: n.label,
              route: n.route,
              nodeType: n.nodeType,
              requiredPermissionCode: n.requiredPermissionCode,
              sortOrder: n.sortOrder,
            })),
          ),
        },
        req.id,
      );
    },
  );

  app.post(
    '/admin/access/feature-tree',
    { schema: { body: featureNodeBody }, preHandler: authorize('access:feature-tree:manage') },
    async (req) => {
      const ctx = requireCtx(req);
      const body = featureNodeBody.parse(req.body);
      if (body.parentId) {
        const parent = await db.featureNode.findUnique({ where: { id: body.parentId } });
        if (!parent) throw badRequest('Parent node tidak ditemukan.');
      }
      let node;
      try {
        node = await db.featureNode.create({ data: body });
      } catch (err) {
        if (isUniqueViolation(err)) throw conflict('Data sudah ada.');
        throw err;
      }
      await writeAudit(db, {
        actorUserId: ctx.user.id,
        action: 'ACCESS_FEATURE_NODE_CREATE',
        objectType: 'featureNode',
        objectId: node.id,
        after: node,
        requestId: req.id,
      });
      return ok(node, req.id);
    },
  );

  app.patch(
    '/admin/access/feature-tree/:id',
    { schema: { params: idParams, body: featureNodePatchBody }, preHandler: authorize('access:feature-tree:manage') },
    async (req) => {
      const ctx = requireCtx(req);
      const { id } = idParams.parse(req.params);
      const body = featureNodePatchBody.parse(req.body);
      const before = await db.featureNode.findUnique({ where: { id } });
      if (!before) throw notFound();
      if (body.parentId !== undefined && body.parentId !== null) {
        if (body.parentId === id) throw unprocessable('Node tidak dapat menjadi parent dirinya sendiri.');
        const parent = await db.featureNode.findUnique({ where: { id: body.parentId } });
        if (!parent) throw badRequest('Parent node tidak ditemukan.');
      }
      const node = await db.featureNode.update({ where: { id }, data: body });
      await writeAudit(db, {
        actorUserId: ctx.user.id,
        action: 'ACCESS_FEATURE_NODE_UPDATE',
        objectType: 'featureNode',
        objectId: id,
        before,
        after: node,
        requestId: req.id,
      });
      return ok(node, req.id);
    },
  );

  // ---------- ABAC policies ----------

  app.get(
    '/admin/access/policies',
    { schema: { querystring: policyListQuery }, preHandler: authorize('access:policies:manage') },
    async (req) => {
      const query = policyListQuery.parse(req.query);
      const where: Prisma.AbacPolicyWhereInput = {
        ...(query.permissionCode ? { permissionCode: query.permissionCode } : {}),
      };
      const [total, items] = await db.$transaction([
        db.abacPolicy.count({ where }),
        db.abacPolicy.findMany({ where, orderBy: { code: 'asc' }, ...skipTake(query) }),
      ]);
      return ok({ items, pagination: paginationMeta(query, total) }, req.id);
    },
  );

  app.post(
    '/admin/access/policies',
    { schema: { body: policyCreateBody }, preHandler: authorize('access:policies:manage') },
    async (req) => {
      const ctx = requireCtx(req);
      const body = policyCreateBody.parse(req.body);
      const conditionJson = validateConditionJson(body.conditionJson);
      let policy;
      try {
        policy = await db.abacPolicy.create({
          data: {
            code: body.code,
            permissionCode: body.permissionCode,
            effect: body.effect,
            conditionJson,
            description: body.description,
          },
        });
      } catch (err) {
        if (isUniqueViolation(err)) throw conflict('Data sudah ada.');
        throw err;
      }
      await writeAudit(db, {
        actorUserId: ctx.user.id,
        action: 'ACCESS_POLICY_CREATE',
        objectType: 'abacPolicy',
        objectId: policy.id,
        after: policy,
        requestId: req.id,
      });
      return ok(policy, req.id);
    },
  );

  app.patch(
    '/admin/access/policies/:id',
    { schema: { params: idParams, body: policyPatchBody }, preHandler: authorize('access:policies:manage') },
    async (req) => {
      const ctx = requireCtx(req);
      const { id } = idParams.parse(req.params);
      const body = policyPatchBody.parse(req.body);
      const before = await db.abacPolicy.findUnique({ where: { id } });
      if (!before) throw notFound();
      const conditionJson = body.conditionJson !== undefined ? validateConditionJson(body.conditionJson) : undefined;
      const policy = await db.abacPolicy.update({
        where: { id },
        data: {
          ...(body.status !== undefined ? { status: body.status } : {}),
          ...(body.effect !== undefined ? { effect: body.effect } : {}),
          ...(conditionJson !== undefined ? { conditionJson } : {}),
        },
      });
      await writeAudit(db, {
        actorUserId: ctx.user.id,
        action: 'ACCESS_POLICY_UPDATE',
        objectType: 'abacPolicy',
        objectId: id,
        before,
        after: policy,
        requestId: req.id,
      });
      return ok(policy, req.id);
    },
  );

  // ---------- Simulation (diagnostic only, grants nothing) ----------

  app.get(
    '/admin/access/simulate',
    { schema: { querystring: simulateQuery }, preHandler: authorize('access:simulate') },
    async (req) => {
      const ctx = requireCtx(req);
      const query = simulateQuery.parse(req.query);
      const targetCtx = await loadAccessContext(db, query.userId);
      if (!targetCtx) throw notFound('User tidak ditemukan.');
      const allowed = hasPermission(targetCtx, query.permissionCode);
      const result = {
        userId: query.userId,
        permissionCode: query.permissionCode,
        allowed,
        roles: targetCtx.roleCodes,
        deniedReason: targetCtx.denied.has(query.permissionCode),
      };
      await writeAudit(db, {
        actorUserId: ctx.user.id,
        action: 'ACCESS_SIMULATE',
        objectType: 'user',
        objectId: query.userId,
        after: result,
        reason: 'simulasi permission (diagnostik)',
        requestId: req.id,
      });
      return ok(result, req.id);
    },
  );
}
