import { describe, expect, it } from 'vitest';
import {
  formatDateWib,
  formatTimeWib,
  formatWib,
  fromDatetimeLocalWib,
  nextDay,
  todayWibDateString,
  toDatetimeLocalWib,
  DAY_STATUS_LABELS,
  LEAVE_STATUS_LABELS,
  dayStatusLabel,
  formatMeters,
} from './format';

describe('formatWib', () => {
  it('converts UTC ISO timestamps to WIB (UTC+7)', () => {
    expect(formatWib('2025-01-15T02:30:00.000Z')).toBe('15/01/2025 09:30 WIB');
    expect(formatWib('2025-01-15T00:00:00.000Z')).toBe('15/01/2025 07:00 WIB');
  });

  it('rolls the date over past midnight WIB', () => {
    expect(formatWib('2025-01-15T17:30:00.000Z')).toBe('16/01/2025 00:30 WIB');
  });

  it('returns a dash for empty or invalid input', () => {
    expect(formatWib(null)).toBe('-');
    expect(formatWib(undefined)).toBe('-');
    expect(formatWib('not-a-date')).toBe('-');
  });
});

describe('formatDateWib', () => {
  it('formats plain work dates without timezone shifting', () => {
    expect(formatDateWib('2025-01-15')).toBe('15/01/2025');
  });

  it('formats ISO timestamps in WIB', () => {
    expect(formatDateWib('2025-01-15T20:00:00.000Z')).toBe('16/01/2025');
  });
});

describe('formatTimeWib', () => {
  it('passes through schedule time strings', () => {
    expect(formatTimeWib('08:00')).toBe('08:00');
    expect(formatTimeWib('17:00:00')).toBe('17:00');
  });

  it('converts ISO timestamps to WIB time', () => {
    expect(formatTimeWib('2025-01-15T01:15:00.000Z')).toBe('08:15');
  });
});

describe('status label maps', () => {
  it('uses Bahasa Indonesia labels for day statuses', () => {
    expect(DAY_STATUS_LABELS['SCHEDULED']).toBe('Terjadwal');
    expect(DAY_STATUS_LABELS['LATE']).toBe('Terlambat');
    expect(DAY_STATUS_LABELS['EARLY_DEPARTURE_APPROVED']).toBe('Pulang Awal Berizin');
    expect(dayStatusLabel('NEEDS_REVIEW')).toBe('Perlu Review');
    expect(dayStatusLabel('UNKNOWN_X')).toBe('UNKNOWN_X');
    expect(dayStatusLabel(null)).toBe('-');
  });

  it('uses Bahasa Indonesia labels for leave statuses', () => {
    expect(LEAVE_STATUS_LABELS['PENDING']).toBe('Menunggu');
    expect(LEAVE_STATUS_LABELS['DEPARTED']).toBe('Sedang Izin');
    expect(LEAVE_STATUS_LABELS['RETURNED']).toBe('Sudah Kembali');
  });
});

describe('date helpers', () => {
  it('computes exclusive end dates', () => {
    expect(nextDay('2025-01-15')).toBe('2025-01-16');
    expect(nextDay('2025-01-31')).toBe('2025-02-01');
  });

  it('returns a YYYY-MM-DD WIB date string', () => {
    expect(todayWibDateString(new Date('2025-01-15T20:00:00.000Z'))).toBe('2025-01-16');
    expect(todayWibDateString(new Date('2025-01-15T02:00:00.000Z'))).toBe('2025-01-15');
  });
});

describe('datetime-local WIB round-trip', () => {
  it('converts ISO to datetime-local in WIB', () => {
    expect(toDatetimeLocalWib('2025-01-15T02:30:00.000Z')).toBe('2025-01-15T09:30');
  });

  it('interprets datetime-local values as WIB', () => {
    expect(fromDatetimeLocalWib('2025-01-15T09:30')).toBe('2025-01-15T02:30:00.000Z');
  });

  it('rejects invalid values', () => {
    expect(fromDatetimeLocalWib('')).toBeNull();
    expect(fromDatetimeLocalWib('nope')).toBeNull();
  });
});

describe('formatMeters', () => {
  it('formats accuracy readably', () => {
    expect(formatMeters(12)).toBe('12 m');
    expect(formatMeters(1500)).toBe('1.5 km');
    expect(formatMeters(null)).toBe('-');
  });
});
