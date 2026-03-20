import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  aggregateDailyByModel,
  aggregateDailyByProvider,
  aggregateDailySummaryByModel,
  aggregateDailySummaryByProvider,
  aggregateSummaryByModel,
  aggregateSummaryByProvider,
  calculateTotals,
} from '../src/aggregate.js';
import { parseUsageCsv } from '../src/cursor-export.js';

const fixturePath = fileURLToPath(new URL('./fixtures/usage-events-sample.csv', import.meta.url));

describe('usage aggregation', () => {
  it('summarizes each day by model labels', () => {
    const csvText = readFileSync(fixturePath, 'utf8');
    const rows = parseUsageCsv(csvText, {
      since: '20260319',
      until: '20260320',
    });

    expect(rows).toHaveLength(4);
    expect(rows.map((row) => row.provider)).toEqual(['openai', 'cursor', 'anthropic', 'cursor']);

    const days = aggregateDailySummaryByModel(rows);
    expect(days).toEqual([
      {
        date: '2026-03-19',
        labels: ['claude-4.6-opus-high-thinking-fast', 'composer-2'],
        totals: {
          inputTokens: 1885,
          outputTokens: 6719,
          cacheCreationTokens: 48912,
          cacheReadTokens: 630041,
          totalTokens: 687557,
          totalCost: expect.closeTo(4.450223, 6),
        },
      },
      {
        date: '2026-03-20',
        labels: ['composer-1.5', 'gpt-5.4-xhigh'],
        totals: {
          inputTokens: 672561,
          outputTokens: 34517,
          cacheCreationTokens: 0,
          cacheReadTokens: 977227,
          totalTokens: 1684305,
          totalCost: expect.closeTo(4.38395415, 6),
        },
      },
    ]);
  });

  it('parses CSV rows and groups each day by model in detailed mode', () => {
    const csvText = readFileSync(fixturePath, 'utf8');
    const rows = parseUsageCsv(csvText, {
      since: '20260319',
      until: '20260320',
    });

    const days = aggregateDailyByModel(rows);
    expect(days).toEqual([
      {
        date: '2026-03-19',
        rows: [
          {
            model: 'claude-4.6-opus-high-thinking-fast',
            inputTokens: 885,
            outputTokens: 4719,
            cacheCreationTokens: 48912,
            cacheReadTokens: 625041,
            totalTokens: 679557,
            totalCost: expect.closeTo(4.443723, 6),
          },
          {
            model: 'composer-2',
            inputTokens: 1000,
            outputTokens: 2000,
            cacheCreationTokens: 0,
            cacheReadTokens: 5000,
            totalTokens: 8000,
            totalCost: expect.closeTo(0.0065, 6),
          },
        ],
        totals: {
          inputTokens: 1885,
          outputTokens: 6719,
          cacheCreationTokens: 48912,
          cacheReadTokens: 630041,
          totalTokens: 687557,
          totalCost: expect.closeTo(4.450223, 6),
        },
      },
      {
        date: '2026-03-20',
        rows: [
          {
            model: 'gpt-5.4-xhigh',
            inputTokens: 585209,
            outputTokens: 18733,
            cacheCreationTokens: 0,
            cacheReadTokens: 749568,
            totalTokens: 1353510,
            totalCost: expect.closeTo(3.7223215, 6),
          },
          {
            model: 'composer-1.5',
            inputTokens: 87352,
            outputTokens: 15784,
            cacheCreationTokens: 0,
            cacheReadTokens: 227659,
            totalTokens: 330795,
            totalCost: expect.closeTo(0.66163265, 6),
          },
        ],
        totals: {
          inputTokens: 672561,
          outputTokens: 34517,
          cacheCreationTokens: 0,
          cacheReadTokens: 977227,
          totalTokens: 1684305,
          totalCost: expect.closeTo(4.38395415, 6),
        },
      },
    ]);
  });

  it('groups each day by provider', () => {
    const csvText = readFileSync(fixturePath, 'utf8');
    const rows = parseUsageCsv(csvText, {
      since: '20260319',
      until: '20260320',
    });

    const days = aggregateDailyByProvider(rows);
    expect(days[0]).toEqual({
      date: '2026-03-19',
      rows: [
        {
          provider: 'anthropic',
          inputTokens: 885,
          outputTokens: 4719,
          cacheCreationTokens: 48912,
          cacheReadTokens: 625041,
          totalTokens: 679557,
          totalCost: expect.closeTo(4.443723, 6),
        },
        {
          provider: 'cursor',
          inputTokens: 1000,
          outputTokens: 2000,
          cacheCreationTokens: 0,
          cacheReadTokens: 5000,
          totalTokens: 8000,
          totalCost: expect.closeTo(0.0065, 6),
        },
      ],
      totals: {
        inputTokens: 1885,
        outputTokens: 6719,
        cacheCreationTokens: 48912,
        cacheReadTokens: 630041,
        totalTokens: 687557,
        totalCost: expect.closeTo(4.450223, 6),
      },
    });
    expect(days[1]?.rows.map((row) => row.provider)).toEqual(['openai', 'cursor']);
  });

  it('summarizes each day by provider labels', () => {
    const csvText = readFileSync(fixturePath, 'utf8');
    const rows = parseUsageCsv(csvText, {
      since: '20260319',
      until: '20260320',
    });

    const days = aggregateDailySummaryByProvider(rows);
    expect(days.map((day) => day.labels)).toEqual([
      ['anthropic', 'cursor'],
      ['cursor', 'openai'],
    ]);
  });

  it('aggregates the full range by model for summary output', () => {
    const csvText = readFileSync(fixturePath, 'utf8');
    const rows = parseUsageCsv(csvText, {
      since: '20260319',
      until: '20260320',
    });

    const summaryRows = aggregateSummaryByModel(rows);
    expect(summaryRows.map((row) => row.model)).toEqual([
      'claude-4.6-opus-high-thinking-fast',
      'gpt-5.4-xhigh',
      'composer-1.5',
      'composer-2',
    ]);
  });

  it('aggregates the full range by provider for summary output', () => {
    const csvText = readFileSync(fixturePath, 'utf8');
    const rows = parseUsageCsv(csvText, {
      since: '20260319',
      until: '20260320',
    });

    const summaryRows = aggregateSummaryByProvider(rows);
    expect(summaryRows.map((row) => row.provider)).toEqual(['anthropic', 'openai', 'cursor']);
  });

  it('calculates overall totals', () => {
    const csvText = readFileSync(fixturePath, 'utf8');
    const rows = parseUsageCsv(csvText, {
      since: '20260319',
      until: '20260320',
    });

    expect(calculateTotals(rows)).toEqual({
      inputTokens: 674446,
      outputTokens: 41236,
      cacheCreationTokens: 48912,
      cacheReadTokens: 1607268,
      totalTokens: 2371862,
      totalCost: expect.closeTo(8.83417715, 6),
    });
  });
});
