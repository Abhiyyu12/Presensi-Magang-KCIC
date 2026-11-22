// Pure permission evaluation: RBAC grants + ABAC policies. Deny always overrides allow.

export type Effect = 'ALLOW' | 'DENY';

export interface PermissionGrant {
  permissionCode: string;
  effect: Effect;
}

export interface AbacConditionAtom {
  subject: 'roleCodes' | 'adminScopeTypes' | 'accountStatus' | 'isIntern';
  op: 'includes' | 'equals' | 'notEquals';
  value: string | boolean;
}

export interface AbacCondition {
  all?: AbacConditionAtom[];
  any?: AbacConditionAtom[];
  not?: AbacConditionAtom;
}

export interface AbacPolicyInput {
  permissionCode: string;
  effect: Effect;
  condition: AbacCondition;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface SubjectAttributes {
  roleCodes: string[];
  adminScopeTypes: string[];
  accountStatus: string;
  isIntern: boolean;
}

export function evaluateAtom(atom: AbacConditionAtom, attrs: SubjectAttributes): boolean {
  let actual: unknown;
  switch (atom.subject) {
    case 'roleCodes': actual = attrs.roleCodes; break;
    case 'adminScopeTypes': actual = attrs.adminScopeTypes; break;
    case 'accountStatus': actual = attrs.accountStatus; break;
    case 'isIntern': actual = attrs.isIntern; break;
  }
  switch (atom.op) {
    case 'includes':
      return Array.isArray(actual) && actual.includes(atom.value);
    case 'equals':
      return actual === atom.value;
    case 'notEquals':
      return actual !== atom.value;
  }
}

export function evaluateCondition(cond: AbacCondition, attrs: SubjectAttributes): boolean {
  let result = true;
  if (cond.all) result = result && cond.all.every((a) => evaluateAtom(a, attrs));
  if (cond.any) result = result && cond.any.some((a) => evaluateAtom(a, attrs));
  if (cond.not) result = result && !evaluateAtom(cond.not, attrs);
  return result;
}

export interface EffectivePermissions {
  allowed: Set<string>;
  denied: Set<string>;
}

export function computeEffectivePermissions(
  grants: PermissionGrant[],
  policies: AbacPolicyInput[],
  attrs: SubjectAttributes,
): EffectivePermissions {
  const allows = new Set<string>();
  const denies = new Set<string>();
  for (const g of grants) {
    if (g.effect === 'DENY') denies.add(g.permissionCode);
    else allows.add(g.permissionCode);
  }
  for (const p of policies) {
    if (p.status !== 'ACTIVE') continue;
    if (!evaluateCondition(p.condition, attrs)) continue;
    if (p.effect === 'DENY') denies.add(p.permissionCode);
    else allows.add(p.permissionCode);
  }
  // Deny overrides allow.
  for (const d of denies) allows.delete(d);
  return { allowed: allows, denied: denies };
}
