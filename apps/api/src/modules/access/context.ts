import type { PrismaClient, User } from '@prisma/client';
import { computeEffectivePermissions, type PermissionGrant, type AbacPolicyInput, type AbacCondition } from './evaluator.js';

export interface AccessContext {
  user: User;
  roleCodes: string[];
  roles: { id: string; code: string; name: string }[];
  permissions: Set<string>;
  denied: Set<string>;
  adminScopes: { scopeType: 'GLOBAL' | 'BUREAU' | 'DIVISION'; scopeId: string | null }[];
  internProfileId: string | null;
  hasGlobalAdminScope: boolean;
}

export async function loadAccessContext(db: PrismaClient, userId: string): Promise<AccessContext | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      roleAssignments: {
        where: { validFrom: { lte: new Date() }, OR: [{ validTo: null }, { validTo: { gte: new Date() } }] },
        include: { role: { include: { rolePermissions: { include: { permission: true } } } } },
      },
      permissionOverrides: {
        where: { validFrom: { lte: new Date() }, OR: [{ validTo: null }, { validTo: { gte: new Date() } }] },
        include: { permission: true },
      },
      adminScopes: { where: { validFrom: { lte: new Date() }, OR: [{ validTo: null }, { validTo: { gte: new Date() } }] } },
      internProfile: { select: { id: true } },
    },
  });
  if (!user) return null;

  const roleCodes: string[] = [];
  const roles: { id: string; code: string; name: string }[] = [];
  const grants: PermissionGrant[] = [];
  for (const ra of user.roleAssignments) {
    if (!ra.role || ra.role.status !== 'ACTIVE') continue;
    roleCodes.push(ra.role.code);
    roles.push({ id: ra.role.id, code: ra.role.code, name: ra.role.name });
    for (const rp of ra.role.rolePermissions) {
      grants.push({ permissionCode: rp.permission.code, effect: rp.effect });
    }
  }
  for (const ov of user.permissionOverrides) {
    grants.push({ permissionCode: ov.permission.code, effect: ov.effect });
  }

  const policies = await db.abacPolicy.findMany({ where: { status: 'ACTIVE' } });
  const policyInputs: AbacPolicyInput[] = policies.map((p) => ({
    permissionCode: p.permissionCode,
    effect: p.effect,
    condition: p.conditionJson as AbacCondition,
    status: p.status as 'ACTIVE',
  }));

  const scopes = user.adminScopes.map((s) => ({ scopeType: s.scopeType, scopeId: s.scopeId }));
  const attrs = {
    roleCodes,
    adminScopeTypes: scopes.map((s) => s.scopeType),
    accountStatus: user.accountStatus,
    isIntern: user.internProfile !== null,
  };
  const effective = computeEffectivePermissions(grants, policyInputs, attrs);

  return {
    user,
    roleCodes,
    roles,
    permissions: effective.allowed,
    denied: effective.denied,
    adminScopes: scopes,
    internProfileId: user.internProfile?.id ?? null,
    hasGlobalAdminScope: scopes.some((s) => s.scopeType === 'GLOBAL'),
  };
}

export function hasPermission(ctx: AccessContext, code: string): boolean {
  return ctx.permissions.has(code) && !ctx.denied.has(code);
}
