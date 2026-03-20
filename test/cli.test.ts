import { describe, expect, it } from 'vitest';

import { formatUsageHeader, parseArgs } from '../src/cli.js';

describe('cli args', () => {
  it('defaults to daily model summary output', () => {
    expect(parseArgs([])).toMatchObject({
      output: 'daily',
      group: 'model',
      detailed: false,
      json: false,
    });
  });

  it('parses explicit output and group flags', () => {
    expect(parseArgs(['-o', 'summary', '-g', 'provider'])).toMatchObject({
      output: 'summary',
      group: 'provider',
      detailed: false,
    });
  });

  it('accepts detailed aliases for daily output', () => {
    expect(parseArgs(['--detailed'])).toMatchObject({
      output: 'daily',
      detailed: true,
    });
    expect(parseArgs(['--defailed'])).toMatchObject({
      output: 'daily',
      detailed: true,
    });
  });

  it('rejects detailed summary output', () => {
    expect(() => parseArgs(['-o', 'summary', '-d'])).toThrow(
      'The --detailed flag only applies to --output daily.',
    );
  });

  it('formats a smart daily usage header', () => {
    expect(formatUsageHeader('20260319', '20260320')).toBe(
      'Showing usage from 2026-03-19 to 2026-03-20 (2 days)',
    );
  });

  it('formats a singular summary usage header', () => {
    expect(formatUsageHeader('20260320', '20260320')).toBe(
      'Showing usage from 2026-03-20 to 2026-03-20 (1 day)',
    );
  });
});
