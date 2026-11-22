const TZ = 'Asia/Jakarta';

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function zonedParts(instant: Date, tz: string = TZ): ZonedParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts: Record<string, number> = {};
  for (const p of fmt.formatToParts(instant)) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value);
  }
  return {
    year: parts.year!,
    month: parts.month!,
    day: parts.day!,
    hour: parts.hour! === 24 ? 0 : parts.hour!,
    minute: parts.minute!,
    second: parts.second!,
  };
}

function tzOffsetMinutes(instantMs: number, tz: string = TZ): number {
  const p = zonedParts(new Date(instantMs), tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(instantMs / 1000) * 1000) / 60000);
}

/** Business date (YYYY-MM-DD) in Asia/Jakarta for a given instant. */
export function businessDate(instant: Date = new Date(), tz: string = TZ): string {
  const p = zonedParts(instant, tz);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** UTC instant for a wall-clock date+time in the business timezone. */
export function zonedTimeToUtc(dateStr: string, timeStr: string, tz: string = TZ): Date {
  const [y, m, d] = dateStr.split('-').map(Number) as [number, number, number];
  const [hh, mm] = timeStr.split(':').map(Number) as [number, number];
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const offset = tzOffsetMinutes(guess - 12 * 3600 * 1000, tz);
  const attempt = guess - offset * 60000;
  const offset2 = tzOffsetMinutes(attempt, tz);
  return new Date(guess - offset2 * 60000);
}

/** Wall clock HH:mm:ss in business timezone. */
export function businessTime(instant: Date, tz: string = TZ): string {
  const p = zonedParts(instant, tz);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}:${String(p.second).padStart(2, '0')}`;
}

/** "HH:mm" wall clock in business timezone. */
export function businessHHmm(instant: Date, tz: string = TZ): string {
  const p = zonedParts(instant, tz);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

export function formatWib(instant: Date): string {
  return `${businessDate(instant)} ${businessTime(instant)} WIB`;
}

/** Weekday 1=Monday..7=Sunday in business timezone. */
export function businessWeekday(instant: Date, tz: string = TZ): number {
  const p = zonedParts(instant, tz);
  const dow = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  return dow === 0 ? 7 : dow;
}

export function parseDateOnly(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(dateStr: string, days: number): string {
  const d = parseDateOnly(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
