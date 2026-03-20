import { describe, expect, it } from 'vitest';

import {
  formatDateArg,
  getDefaultDateRange,
  parseDateArg,
  resolveDateRange,
  toEpochRange,
} from '../src/date-range.js';

describe('date range helpers', () => {
  it('parses YYYYMMDD values', () => {
    const date = parseDateArg('20260320');
    expect(formatDateArg(date)).toBe('20260320');
  });

  it('rejects invalid calendar dates', () => {
    expect(() => parseDateArg('20260230')).toThrow(/real calendar date/);
  });

  it('builds the default 30 day window', () => {
    const range = getDefaultDateRange(new Date('2026-03-20T12:00:00.000Z'));
    expect(range).toEqual({
      since: '20260218',
      until: '20260320',
    });
  });

  it('rejects reversed date ranges', () => {
    expect(() => resolveDateRange('20260321', '20260320')).toThrow(/on or before/);
  });

  it('returns inclusive day boundaries', () => {
    const epochRange = toEpochRange({
      since: '20260320',
      until: '20260320',
    });

    expect(epochRange.endDate - epochRange.startDate).toBe(86_399_999);
  });
});
