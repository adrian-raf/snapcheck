/** Western Indonesia Time (WIB, UTC+07:00) — the default offset used by most SNAP providers. */
export const WIB_OFFSET_MINUTES = 7 * 60;

const MINUTE_IN_MS = 60_000;

/**
 * ISO 8601 with seconds and a timezone designator, optionally with milliseconds.
 * Accepts `2026-10-22T10:00:00+07:00` and `2026-10-22T03:00:00.000Z`.
 */
const SNAP_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})$/;

export interface TimestampFormat {
  /** Offset from UTC. `0` is written as `Z`. Defaults to WIB (+07:00). */
  readonly offsetMinutes?: number;
  /** Adds `.SSS`. Some providers (e.g. BRI) document it; others (e.g. BCA) use exactly 25 characters. */
  readonly milliseconds?: boolean;
}

/**
 * Formats a date as a SNAP `X-TIMESTAMP`.
 *
 * @example formatSnapTimestamp(date)                                     // 2026-10-22T23:01:02+07:00
 * @example formatSnapTimestamp(date, { offsetMinutes: 0, milliseconds: true }) // 2026-10-22T16:01:02.345Z
 */
export function formatSnapTimestamp(date: Date, format: TimestampFormat = {}): string {
  const { offsetMinutes = WIB_OFFSET_MINUTES, milliseconds = false } = format;
  const shifted = new Date(date.getTime() + offsetMinutes * MINUTE_IN_MS);
  const localPart = shifted.toISOString().slice(0, milliseconds ? 23 : 19);
  return `${localPart}${formatOffset(offsetMinutes)}`;
}

export function isValidSnapTimestamp(value: string): boolean {
  return SNAP_TIMESTAMP_PATTERN.test(value) && !Number.isNaN(Date.parse(value));
}

/**
 * Calendar day (`yyyy-MM-dd`) of an instant in the given offset.
 * Used to decide whether two requests happened on "the same day".
 */
export function calendarDay(date: Date, offsetMinutes: number = WIB_OFFSET_MINUTES): string {
  return formatSnapTimestamp(date, { offsetMinutes }).slice(0, 10);
}

function formatOffset(offsetMinutes: number): string {
  if (offsetMinutes === 0) {
    return 'Z';
  }
  const sign = offsetMinutes > 0 ? '+' : '-';
  const absolute = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absolute / 60)).padStart(2, '0');
  const minutes = String(absolute % 60).padStart(2, '0');
  return `${sign}${hours}:${minutes}`;
}
