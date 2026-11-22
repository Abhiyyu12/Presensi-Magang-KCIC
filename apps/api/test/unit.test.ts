import { describe, expect, it } from 'vitest';
import { computeEffectivePermissions, evaluateCondition } from '../src/modules/access/evaluator.js';
import type { SubjectAttributes } from '../src/modules/access/evaluator.js';
import { businessDate, businessWeekday, zonedTimeToUtc, addDays } from '../src/common/time.js';

const internAttrs: SubjectAttributes = {
  roleCodes: ['INTERN'],
  adminScopeTypes: [],
  accountStatus: 'ACTIVE',
  isIntern: true,
};

describe('computeEffectivePermissions', () => {
  it('returns empty set for a role without grants (default deny)', () => {
    const eff = computeEffectivePermissions([], [], internAttrs);
    expect(eff.allowed.size).toBe(0);
  });

  it('deny overrides allow from RBAC grants', () => {
    const eff = computeEffectivePermissions(
      [
        { permissionCode: 'report:view', effect: 'ALLOW' },
        { permissionCode: 'report:view', effect: 'DENY' },
      ],
      [],
      internAttrs,
    );
    expect(eff.allowed.has('report:view')).toBe(false);
    expect(eff.denied.has('report:view')).toBe(true);
  });

  it('applies ACTIVE ABAC deny policy matching subject condition', () => {
    const eff = computeEffectivePermissions(
      [{ permissionCode: 'admin:users:manage', effect: 'ALLOW' }],
      [
        {
          permissionCode: 'admin:users:manage',
          effect: 'DENY',
          status: 'ACTIVE',
          condition: { all: [{ subject: 'accountStatus', op: 'notEquals', value: 'ACTIVE' }] },
        },
      ],
      { ...internAttrs, accountStatus: 'SUSPENDED' },
    );
    expect(eff.allowed.has('admin:users:manage')).toBe(false);
  });

  it('ignores ABAC policy whose condition does not match or is INACTIVE', () => {
    const eff = computeEffectivePermissions(
      [{ permissionCode: 'leave:request', effect: 'ALLOW' }],
      [
        {
          permissionCode: 'leave:request',
          effect: 'DENY',
          status: 'ACTIVE',
          condition: { all: [{ subject: 'isIntern', op: 'equals', value: false }] },
        },
        {
          permissionCode: 'leave:request',
          effect: 'DENY',
          status: 'INACTIVE',
          condition: { all: [{ subject: 'isIntern', op: 'equals', value: true }] },
        },
      ],
      internAttrs,
    );
    expect(eff.allowed.has('leave:request')).toBe(true);
  });

  it('evaluateCondition supports all/any/not composition', () => {
    const cond = {
      all: [{ subject: 'roleCodes', op: 'includes', value: 'ADMIN_HR' } as const],
      any: [
        { subject: 'adminScopeTypes', op: 'includes', value: 'GLOBAL' } as const,
        { subject: 'adminScopeTypes', op: 'includes', value: 'BUREAU' } as const,
      ],
      not: { subject: 'accountStatus', op: 'equals', value: 'INACTIVE' } as const,
    };
    expect(
      evaluateCondition(cond, {
        roleCodes: ['ADMIN_HR'],
        adminScopeTypes: ['BUREAU'],
        accountStatus: 'ACTIVE',
        isIntern: false,
      }),
    ).toBe(true);
    expect(
      evaluateCondition(cond, {
        roleCodes: ['INTERN'],
        adminScopeTypes: ['GLOBAL'],
        accountStatus: 'ACTIVE',
        isIntern: true,
      }),
    ).toBe(false);
  });
});

describe('business time helpers (Asia/Jakarta, UTC+7)', () => {
  it('zonedTimeToUtc converts 09:00 WIB to 02:00 UTC', () => {
    expect(zonedTimeToUtc('2026-11-23', '09:00').toISOString()).toBe('2026-11-23T02:00:00.000Z');
  });

  it('businessDate rolls over after 17:00 UTC', () => {
    expect(businessDate(new Date('2026-11-22T16:59:59Z'))).toBe('2026-11-22');
    expect(businessDate(new Date('2026-11-22T17:00:00Z'))).toBe('2026-11-23');
  });

  it('businessWeekday returns 1=Monday..7=Sunday', () => {
    // 2026-11-23 is a Monday
    expect(businessWeekday(new Date('2026-11-23T02:00:00Z'))).toBe(1);
    // 2026-11-29 is a Sunday
    expect(businessWeekday(new Date('2026-11-29T02:00:00Z'))).toBe(7);
  });

  it('addDays handles month boundaries', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });
});
