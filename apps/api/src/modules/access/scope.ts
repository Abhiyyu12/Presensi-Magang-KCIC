import type { Prisma, PrismaClient } from '@prisma/client';
import type { AccessContext } from './context.js';
import { hasPermission } from './context.js';
import { forbidden } from '../../common/errors.js';

export function requirePermission(ctx: AccessContext, code: string): void {
  if (!hasPermission(ctx, code)) throw forbidden();
}

export function isActiveSupervisorOf(db: PrismaClient, ctx: AccessContext, internProfileId: string): Promise<boolean> {
  const now = new Date();
  return db.supervisorAssignment
    .count({
      where: {
        supervisorUserId: ctx.user.id,
        internProfileId,
        status: 'ACTIVE',
        validFrom: { lte: now },
        OR: [{ validTo: null }, { validTo: { gte: now } }],
      },
    })
    .then((c) => c > 0);
}

export function adminScopeCovers(
  ctx: AccessContext,
  target: { bureauId: string | null; divisionId: string | null },
): boolean {
  if (ctx.hasGlobalAdminScope) return true;
  return ctx.adminScopes.some((s) => {
    if (s.scopeType === 'BUREAU') return target.bureauId !== null && s.scopeId === target.bureauId;
    if (s.scopeType === 'DIVISION') return target.divisionId !== null && s.scopeId === target.divisionId;
    return false;
  });
}

export type InternAccessKind = 'self' | 'supervisor' | 'admin' | null;

export async function internAccessKind(
  db: PrismaClient,
  ctx: AccessContext,
  internProfileId: string,
): Promise<InternAccessKind> {
  if (ctx.internProfileId === internProfileId) return 'self';
  const profile = await db.internProfile.findUnique({
    where: { id: internProfileId },
    select: { bureauId: true, divisionId: true },
  });
  if (!profile) return null;
  if (await isActiveSupervisorOf(db, ctx, internProfileId)) return 'supervisor';
  if (adminScopeCovers(ctx, profile)) return 'admin';
  return null;
}

/**
 * Prisma where-fragment restricting intern profiles to the actor's scope.
 * Scope is applied in the database query, never post-fetch.
 */
export async function internScopeWhere(
  db: PrismaClient,
  ctx: AccessContext,
): Promise<Prisma.InternProfileWhereInput> {
  const clauses: Prisma.InternProfileWhereInput[] = [];

  if (ctx.internProfileId) clauses.push({ id: ctx.internProfileId });

  const now = new Date();
  if (
    hasPermission(ctx, 'attendance:view:scoped') ||
    hasPermission(ctx, 'leave:view:scoped') ||
    hasPermission(ctx, 'report:view')
  ) {
    const assigned = await db.supervisorAssignment.findMany({
      where: {
        supervisorUserId: ctx.user.id,
        status: 'ACTIVE',
        validFrom: { lte: now },
        OR: [{ validTo: null }, { validTo: { gte: now } }],
      },
      select: { internProfileId: true },
    });
    if (assigned.length > 0) clauses.push({ id: { in: assigned.map((a) => a.internProfileId) } });

    if (ctx.hasGlobalAdminScope) {
      clauses.push({});
    } else {
      const bureauIds = ctx.adminScopes.filter((s) => s.scopeType === 'BUREAU').map((s) => s.scopeId).filter(Boolean) as string[];
      const divisionIds = ctx.adminScopes.filter((s) => s.scopeType === 'DIVISION').map((s) => s.scopeId).filter(Boolean) as string[];
      if (bureauIds.length || divisionIds.length) {
        clauses.push({
          OR: [
            ...(bureauIds.length ? [{ bureauId: { in: bureauIds } }] : []),
            ...(divisionIds.length ? [{ divisionId: { in: divisionIds } }] : []),
          ],
        });
      }
    }
  }

  if (clauses.length === 0) return { id: '__none__' }; // default deny
  if (clauses.length === 1) return clauses[0]!;
  return { OR: clauses };
}
