import { describe, expect, it } from 'vitest';

import { calendarDay, formatSnapTimestamp, isValidSnapTimestamp } from '../../../src/core';

const INSTANT = new Date('2026-10-22T16:01:02.345Z');

describe('formatSnapTimestamp', () => {
  it('formats in WIB (+07:00) by default, without milliseconds', () => {
    expect(formatSnapTimestamp(INSTANT)).toBe('2026-10-22T23:01:02+07:00');
  });

  it.each([
    [0, '2026-10-22T16:01:02Z'],
    [8 * 60, '2026-10-23T00:01:02+08:00'],
    [-(5 * 60 + 30), '2026-10-22T10:31:02-05:30'],
  ])('supports offset %i minutes', (offsetMinutes, expected) => {
    expect(formatSnapTimestamp(INSTANT, { offsetMinutes })).toBe(expected);
  });

  it('adds milliseconds when asked (BRI style)', () => {
    expect(formatSnapTimestamp(INSTANT, { offsetMinutes: 0, milliseconds: true })).toBe(
      '2026-10-22T16:01:02.345Z',
    );
  });

  it('is exactly 25 characters without milliseconds (BCA style)', () => {
    expect(formatSnapTimestamp(INSTANT)).toHaveLength(25);
  });

  it.each([{}, { milliseconds: true }, { offsetMinutes: 0, milliseconds: true }])(
    'produces a value that passes its own validator for %j',
    (format) => {
      expect(isValidSnapTimestamp(formatSnapTimestamp(INSTANT, format))).toBe(true);
    },
  );
});

describe('isValidSnapTimestamp', () => {
  it.each(['2026-10-22T23:01:02+07:00', '2026-10-22T16:01:02.345Z', '2026-10-22T16:01:02Z'])(
    'accepts %s',
    (value) => {
      expect(isValidSnapTimestamp(value)).toBe(true);
    },
  );

  it.each([
    ['no offset', '2026-10-22T23:01:02'],
    ['date only', '2026-10-22'],
    ['space separator', '2026-10-22 23:01:02+07:00'],
    ['offset without colon', '2026-10-22T23:01:02+0700'],
    ['impossible date', '2026-13-45T23:01:02+07:00'],
    ['epoch millis', '1761148862000'],
  ])('rejects %s', (_case, value) => {
    expect(isValidSnapTimestamp(value)).toBe(false);
  });
});

describe('calendarDay', () => {
  it('uses the WIB calendar day, not the UTC one', () => {
    // 17:30 UTC is already the next day in Jakarta.
    expect(calendarDay(new Date('2026-10-22T17:30:00Z'))).toBe('2026-10-23');
  });
});
