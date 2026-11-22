import { describe, expect, it } from 'vitest';
import { MASTER_RESOURCES, buildSchema } from './config';
import { ApiError } from '../../lib/api';

const byKey = (key: string) => {
  const config = MASTER_RESOURCES.find((r) => r.key === key);
  if (!config) throw new Error(`missing config ${key}`);
  return config;
};

// Required create fields must mirror the API zod bodies in
// apps/api/src/modules/admin/routes.ts and schedules/routes.ts.
const REQUIRED_CREATE_FIELDS: Record<string, string[]> = {
  bureaus: ['name', 'code'],
  divisions: ['name', 'code', 'bureauId'],
  placements: ['name', 'code'],
  'intern-profiles': ['userId', 'participantNumber', 'bureauId', 'startDate'],
  assignments: ['supervisorUserId', 'internProfileId', 'status'],
  scopes: ['userId', 'scopeType'],
  calendar: ['calendarDate', 'dayType'],
  'leave-categories': ['name', 'code'],
  'business-parameters': ['key', 'value'],
};

describe('master resource configs match API contracts', () => {
  for (const [key, required] of Object.entries(REQUIRED_CREATE_FIELDS)) {
    it(`${key}: required create fields = ${required.join(', ')}`, () => {
      const config = byKey(key);
      const actual = config.fields.filter((f) => f.required).map((f) => f.name).sort();
      expect(actual).toEqual([...required].sort());
    });
  }

  it('intern-profiles/assignments/scopes keep immutable FKs create-only', () => {
    expect(byKey('intern-profiles').fields.find((f) => f.name === 'userId')?.createOnly).toBe(true);
    for (const name of ['supervisorUserId', 'internProfileId']) {
      expect(byKey('assignments').fields.find((f) => f.name === name)?.createOnly).toBe(true);
    }
    for (const name of ['userId', 'scopeType', 'scopeId']) {
      expect(byKey('scopes').fields.find((f) => f.name === name)?.createOnly).toBe(true);
    }
    expect(byKey('calendar').fields.find((f) => f.name === 'calendarDate')?.createOnly).toBe(true);
  });

  it('assignments/scopes convert form dates to ISO datetime for the API', () => {
    for (const key of ['assignments', 'scopes']) {
      const config = byKey(key);
      const payload = config.toPayload?.({ validFrom: '2026-11-22', validTo: '' }, 'create') ?? {};
      expect(payload['validFrom']).toBe('2026-11-22T00:00:00.000Z');
      expect(payload['validTo']).toBe('');
    }
  });

  it('assignments/scopes toForm trims ISO dates back to YYYY-MM-DD', () => {
    for (const key of ['assignments', 'scopes']) {
      const form = byKey(key).toForm?.({ validFrom: '2026-11-22T00:00:00.000Z', validTo: null }) ?? {};
      expect(form['validFrom']).toBe('2026-11-22');
      expect(form['validTo']).toBe('');
    }
  });

  it('business-parameters toPayload parses JSON value and rejects invalid JSON', () => {
    const config = byKey('business-parameters');
    const payload = config.toPayload?.({ value: '{"value":20}' }, 'edit') ?? {};
    expect(payload['valueJson']).toEqual({ value: 20 });
    expect(payload['value']).toBeUndefined();
    expect(() => config.toPayload?.({ value: 'bukan json' }, 'edit')).toThrow(ApiError);
  });

  it('edit schema drops create-only fields', () => {
    const schema = buildSchema(byKey('intern-profiles').fields, 'edit');
    expect(schema.safeParse({ participantNumber: 'P-1', bureauId: 'x', startDate: '2026-11-22' }).success).toBe(true);
    expect('userId' in schema.shape).toBe(false);
  });
});