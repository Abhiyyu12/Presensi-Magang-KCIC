// Display helpers. All times are rendered in WIB (Asia/Jakarta) from server
// ISO timestamps; the server remains the source of truth for status values.

const WIB_TZ = 'Asia/Jakarta';

interface DateParts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
}

// formatToParts keeps output deterministic across ICU versions/locales
// (separator characters like '.' vs ':' differ between locales).
function wibParts(date: Date): DateParts {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: WIB_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? '';
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') === '24' ? '00' : get('hour'),
    minute: get('minute'),
  };
}

/** 'DD/MM/YYYY HH:mm WIB' from an ISO-8601 timestamp. Returns '-' for invalid input. */
export function formatWib(iso: string | null | undefined): string {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  const p = wibParts(date);
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute} WIB`;
}

/** 'DD/MM/YYYY' (WIB calendar date) from an ISO timestamp or plain date string. */
export function formatDateWib(iso: string | null | undefined): string {
  if (!iso) return '-';
  // Plain date (YYYY-MM-DD) is already a WIB work date on the server.
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  const p = wibParts(date);
  return `${p.day}/${p.month}/${p.year}`;
}

/** 'HH:mm' in WIB. Accepts 'HH:mm:ss' schedule strings as-is. */
export function formatTimeWib(iso: string | null | undefined): string {
  if (!iso) return '-';
  if (/^\d{2}:\d{2}/.test(iso) && iso.length <= 8) return iso.slice(0, 5);
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  const p = wibParts(date);
  return `${p.hour}:${p.minute}`;
}

export function formatWibWithLabel(iso: string | null | undefined): string {
  const formatted = formatWib(iso);
  return formatted === '-' ? '-' : formatted;
}

export const DAY_STATUS_LABELS: Record<string, string> = {
  SCHEDULED: 'Terjadwal',
  PRESENT: 'Hadir',
  LATE: 'Terlambat',
  INCOMPLETE: 'Belum Lengkap',
  NEEDS_REVIEW: 'Perlu Review',
  EARLY_DEPARTURE_APPROVED: 'Pulang Awal Berizin',
  NOT_SCHEDULED: 'Tidak Terjadwal',
};

export const DAY_STATUS_COLORS: Record<string, string> = {
  SCHEDULED: 'bg-slate-100 text-slate-700 border-slate-300',
  PRESENT: 'bg-green-100 text-green-800 border-green-300',
  LATE: 'bg-amber-100 text-amber-800 border-amber-300',
  INCOMPLETE: 'bg-orange-100 text-orange-800 border-orange-300',
  NEEDS_REVIEW: 'bg-purple-100 text-purple-800 border-purple-300',
  EARLY_DEPARTURE_APPROVED: 'bg-sky-100 text-sky-800 border-sky-300',
  NOT_SCHEDULED: 'bg-slate-100 text-slate-500 border-slate-300',
};

export const LEAVE_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Menunggu',
  APPROVED: 'Disetujui',
  REJECTED: 'Ditolak',
  CANCELLED: 'Dibatalkan',
  DEPARTED: 'Sedang Izin',
  RETURNED: 'Sudah Kembali',
  COMPLETED: 'Selesai',
  NEEDS_REVIEW: 'Perlu Review',
};

export const LEAVE_STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800 border-amber-300',
  APPROVED: 'bg-green-100 text-green-800 border-green-300',
  REJECTED: 'bg-red-100 text-red-800 border-red-300',
  CANCELLED: 'bg-slate-100 text-slate-600 border-slate-300',
  DEPARTED: 'bg-sky-100 text-sky-800 border-sky-300',
  RETURNED: 'bg-teal-100 text-teal-800 border-teal-300',
  COMPLETED: 'bg-green-100 text-green-800 border-green-300',
  NEEDS_REVIEW: 'bg-purple-100 text-purple-800 border-purple-300',
};

export const LEAVE_TYPE_LABELS: Record<string, string> = {
  TEMPORARY: 'Izin Sementara (akan kembali)',
  EARLY_DEPARTURE: 'Pulang Lebih Awal (tidak kembali)',
};

export const EVENT_TYPE_LABELS: Record<string, string> = {
  CHECK_IN: 'Check-in',
  CHECK_OUT: 'Check-out',
  DEPARTURE: 'Keluar',
  RETURN: 'Kembali',
  EARLY_CHECKOUT: 'Pulang Lebih Awal',
};

export function dayStatusLabel(status: string | null | undefined): string {
  if (!status) return '-';
  return DAY_STATUS_LABELS[status] ?? status;
}

export function leaveStatusLabel(status: string | null | undefined): string {
  if (!status) return '-';
  return LEAVE_STATUS_LABELS[status] ?? status;
}

/** Today's WIB date as YYYY-MM-DD, for default filter values. */
export function todayWibDateString(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: WIB_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const y = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${d}`;
}

/** Exclusive end date (day after start), matching backend range semantics. */
export function nextDay(dateString: string): string {
  const date = new Date(`${dateString}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return dateString;
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/** Convert an ISO timestamp to a datetime-local input value in WIB. */
export function toDatetimeLocalWib(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: WIB_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

/** Interpret a datetime-local value as WIB and return an ISO-8601 UTC string. */
export function fromDatetimeLocalWib(value: string): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, mo, d, h, mi] = match;
  // WIB is fixed UTC+7 (no DST).
  const utcMs = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi)) - 7 * 3600_000;
  const date = new Date(utcMs);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function formatMeters(meters: number | null | undefined): string {
  if (meters === null || meters === undefined || Number.isNaN(meters)) return '-';
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}
