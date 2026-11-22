import { describe, expect, it } from 'vitest';
import { buildNextValueJson, formatParameterValue, isWorkdayArray } from './ParametersPanel';

describe('ParametersPanel value helpers', () => {
  it('formatParameterValue renders numbers plainly', () => {
    expect(formatParameterValue({ value: 15, status: 'PENDING_KCIC_CONFIRMATION' })).toBe('15');
  });

  it('formatParameterValue renders workday arrays as Indonesian day names', () => {
    expect(formatParameterValue({ value: [1, 2, 3, 4, 5] })).toBe('Senin, Selasa, Rabu, Kamis, Jumat');
    expect(formatParameterValue({ value: [0, 6] })).toBe('Minggu, Sabtu');
  });

  it('formatParameterValue falls back to JSON for unknown shapes', () => {
    expect(formatParameterValue({ value: { nested: true } })).toBe('{"nested":true}');
    expect(formatParameterValue(null)).toBe('-');
  });

  it('isWorkdayArray accepts only integer arrays within 0–6', () => {
    expect(isWorkdayArray([1, 2, 3, 4, 5])).toBe(true);
    expect(isWorkdayArray([0])).toBe(true);
    expect(isWorkdayArray([])).toBe(false);
    expect(isWorkdayArray([7])).toBe(false);
    expect(isWorkdayArray([1.5])).toBe(false);
    expect(isWorkdayArray(['Senin'])).toBe(false);
    expect(isWorkdayArray(15)).toBe(false);
  });

  it('buildNextValueJson replaces only the value key and preserves policy status', () => {
    const next = buildNextValueJson(
      { value: 15, status: 'PENDING_KCIC_CONFIRMATION' },
      20,
    );
    expect(next).toEqual({ value: 20, status: 'PENDING_KCIC_CONFIRMATION' });
    expect(buildNextValueJson(null, 5)).toEqual({ value: 5 });
  });
});
