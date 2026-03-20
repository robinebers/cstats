import { parse } from 'csv-parse/sync';

import { buildSessionToken, resolveCursorAccessToken } from './cursor-auth.js';
import { toLocalDateString } from './date-range.js';
import { estimateRowCost } from './pricing.js';
import type { DateRange, UsageCsvRecord, UsageRow } from './types.js';

const EXPORT_URL = 'https://cursor.com/api/dashboard/export-usage-events-csv';

const REQUIRED_COLUMNS = [
  'Date',
  'Kind',
  'Model',
  'Max Mode',
  'Input (w/ Cache Write)',
  'Input (w/o Cache Write)',
  'Cache Read',
  'Output Tokens',
  'Total Tokens',
  'Cost',
] as const;

function parseIntValue(value: string): number {
  const normalized = value.trim();
  if (normalized === '') {
    return 0;
  }

  return Number.parseInt(normalized.replace(/,/g, ''), 10);
}

function validateColumns(record: Record<string, unknown>): asserts record is UsageCsvRecord {
  for (const column of REQUIRED_COLUMNS) {
    if (!(column in record)) {
      throw new Error(`Cursor CSV is missing expected column "${column}".`);
    }
  }
}

function rowInRange(date: string, range: DateRange): boolean {
  const normalized = date.replace(/-/g, '');
  return normalized >= range.since && normalized <= range.until;
}

export async function downloadUsageCsv(range: { startDate: number; endDate: number }): Promise<string> {
  const accessToken = await resolveCursorAccessToken();
  const { sessionToken } = buildSessionToken(accessToken);
  const url = new URL(EXPORT_URL);
  url.search = new URLSearchParams({
    startDate: String(range.startDate),
    endDate: String(range.endDate),
    strategy: 'tokens',
  }).toString();

  const response = await fetch(url, {
    headers: {
      Cookie: `WorkosCursorSessionToken=${sessionToken}`,
      Accept: 'text/csv',
    },
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error('Cursor export request was rejected. Your local auth may have expired.');
  }

  if (!response.ok) {
    throw new Error(`Cursor export request failed with HTTP ${response.status}.`);
  }

  return response.text();
}

export function parseUsageCsv(csvText: string, range: DateRange): UsageRow[] {
  const parsed = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Array<Record<string, unknown>>;

  return parsed
    .map((record) => {
      validateColumns(record);
      const timestamp = record.Date;
      const date = toLocalDateString(timestamp);
      const model = record.Model.trim();
      const maxMode = record['Max Mode'].trim().toLowerCase() === 'yes';
      const inputCacheWrite = parseIntValue(record['Input (w/ Cache Write)']);
      const inputNoCacheWrite = parseIntValue(record['Input (w/o Cache Write)']);
      const cacheRead = parseIntValue(record['Cache Read']);
      const outputTokens = parseIntValue(record['Output Tokens']);
      const totalTokens = parseIntValue(record['Total Tokens']);

      const pricing = estimateRowCost({
        model,
        maxMode,
        inputCacheWrite,
        inputNoCacheWrite,
        cacheRead,
        outputTokens,
      });

      return {
        timestamp,
        date,
        kind: record.Kind.trim(),
        model,
        provider: pricing.provider,
        maxMode,
        inputCacheWrite,
        inputNoCacheWrite,
        cacheRead,
        outputTokens,
        totalTokens,
        estimatedCost: pricing.estimatedCost,
        csvCost: record.Cost.trim(),
        canonicalModel: pricing.canonicalModel,
      } satisfies UsageRow;
    })
    .filter((row) => rowInRange(row.date, range));
}
