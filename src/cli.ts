#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  aggregateDailyByModel,
  aggregateDailyByProvider,
  aggregateDailySummaryByModel,
  aggregateDailySummaryByProvider,
  aggregateSummaryByModel,
  aggregateSummaryByProvider,
  calculateTotals,
  hasRowUsage,
} from './aggregate.js';
import { downloadUsageCsv, parseUsageCsv } from './cursor-export.js';
import { resolveDateRange, toEpochRange } from './date-range.js';
import { getUnpricedModels } from './pricing.js';
import {
  ResponsiveTable,
  createDailyModelReportTable,
  createDailyModelSummaryTable,
  createDailyProviderReportTable,
  createDailyProviderSummaryTable,
  createSummaryModelReportTable,
  createSummaryProviderReportTable,
  formatDailyModelSectionRow,
  formatDailyProviderSectionRow,
  formatDailySummaryRow,
  formatSummaryModelRow,
  formatSummaryProviderRow,
  formatSummaryTotalsRow,
} from './table.js';
import type {
  DailyJsonOutput,
  DailyReportData,
  GroupMode,
  JsonOutput,
  OutputMode,
  ParsedArgs,
  ReportTotals,
  SummaryJsonOutput,
  SummaryReportData,
  UsageRow,
} from './types.js';

const DAY_MS = 24 * 60 * 60 * 1000;

type DailyModeKey =
  | 'daily:model:summary'
  | 'daily:model:detailed'
  | 'daily:provider:summary'
  | 'daily:provider:detailed';
type SummaryModeKey = 'summary:model' | 'summary:provider';
type ReportModeKey = DailyModeKey | SummaryModeKey;
type TableRow = Parameters<ResponsiveTable['push']>[0];

type PreparedReport = {
  isEmpty: boolean;
  render: (totals: ReportTotals) => string;
  toJson: (since: string, until: string, totals: ReportTotals, unpricedModels: string[]) => JsonOutput;
};

function getVersion(): string {
  const packageJsonPath = fileURLToPath(new URL('../package.json', import.meta.url));
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { version?: string };
  return packageJson.version ?? '0.0.0';
}

function formatDisplayDate(value: string): string {
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function getInclusiveDayCount(since: string, until: string): number {
  const sinceUtc = Date.UTC(Number(since.slice(0, 4)), Number(since.slice(4, 6)) - 1, Number(since.slice(6, 8)));
  const untilUtc = Date.UTC(Number(until.slice(0, 4)), Number(until.slice(4, 6)) - 1, Number(until.slice(6, 8)));
  return Math.floor((untilUtc - sinceUtc) / DAY_MS) + 1;
}

export function formatUsageHeader(since: string, until: string): string {
  const dayCount = getInclusiveDayCount(since, until);
  const dayLabel = dayCount === 1 ? 'day' : 'days';
  return `Showing usage from ${formatDisplayDate(since)} to ${formatDisplayDate(until)} (${dayCount} ${dayLabel})`;
}

function printHelp(): void {
  const version = getVersion();
  console.log(`cstats v${version}

Usage:
  cstats [options]

Options:
  -s, --since <YYYYMMDD>     Filter since date (default: 30 days ago)
  -u, --until <YYYYMMDD>     Filter until date (default: today)
  -o, --output <mode>        Output mode: daily | summary (default: daily)
  -g, --group <mode>         Group each day by: model | provider (default: model)
  -d, --detailed             Show every grouped row within each day
  -j, --json                 Output in JSON format
  -h, --help                 Display this help
  -v, --version              Display version`);
}

function getNextArgValue(argv: string[], index: number, arg: string): string {
  const value = argv[index + 1];
  if (value === undefined) {
    throw new Error(`Missing value for ${arg}.`);
  }

  return value;
}

function parseGroupMode(value: string): GroupMode {
  if (value !== 'model' && value !== 'provider') {
    throw new Error('The --group flag must be either "model" or "provider".');
  }

  return value;
}

function parseOutputMode(value: string): OutputMode {
  if (value !== 'daily' && value !== 'summary') {
    throw new Error('The --output flag must be either "daily" or "summary".');
  }

  return value;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    json: false,
    output: 'daily',
    group: 'model',
    detailed: false,
    help: false,
    version: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case '-s':
      case '--since':
        parsed.since = getNextArgValue(argv, index, arg);
        index += 1;
        break;
      case '-u':
      case '--until':
        parsed.until = getNextArgValue(argv, index, arg);
        index += 1;
        break;
      case '-g':
      case '--group':
        parsed.group = parseGroupMode(getNextArgValue(argv, index, arg));
        index += 1;
        break;
      case '-o':
      case '--output':
        parsed.output = parseOutputMode(getNextArgValue(argv, index, arg));
        index += 1;
        break;
      case '-d':
      case '--detailed':
        parsed.detailed = true;
        break;
      case '-j':
      case '--json':
        parsed.json = true;
        break;
      case '-h':
      case '--help':
        parsed.help = true;
        break;
      case '-v':
      case '--version':
        parsed.version = true;
        break;
      default:
        throw new Error(`Unknown argument "${arg}".`);
    }
  }

  if (parsed.output === 'summary' && parsed.detailed) {
    throw new Error('The --detailed flag only applies to --output daily.');
  }

  return parsed;
}

function renderTable<Row>(
  rows: Row[],
  createTable: () => ResponsiveTable,
  formatRow: (row: Row) => TableRow,
): string {
  const table = createTable();
  for (const row of rows) {
    table.push(formatRow(row));
  }
  return table.toString();
}

function renderSummaryTable<Row>(
  rows: Row[],
  totals: ReportTotals,
  createTable: () => ResponsiveTable,
  formatRow: (row: Row) => TableRow,
): string {
  const table = createTable();
  for (const row of rows) {
    table.push(formatRow(row));
  }
  table.push(formatSummaryTotalsRow(totals));
  return table.toString();
}

function buildDailyJsonOutput(
  group: GroupMode,
  detailed: boolean,
  since: string,
  until: string,
  days: DailyReportData,
  totals: ReportTotals,
  unpricedModels: string[],
): DailyJsonOutput {
  return {
    output: 'daily',
    group,
    detailed,
    since,
    until,
    days,
    totals,
    warnings: {
      unpricedModels,
    },
  };
}

function buildSummaryJsonOutput(
  group: GroupMode,
  since: string,
  until: string,
  rows: SummaryReportData,
  totals: ReportTotals,
  unpricedModels: string[],
): SummaryJsonOutput {
  return {
    output: 'summary',
    group,
    since,
    until,
    rows,
    totals,
    warnings: {
      unpricedModels,
    },
  };
}

function prepareDailyReport<T extends DailyReportData>(
  usageRows: UsageRow[],
  group: GroupMode,
  detailed: boolean,
  aggregate: (rows: UsageRow[]) => T,
  createTable: () => ResponsiveTable,
  formatRow: (row: T[number]) => TableRow,
): PreparedReport {
  const days = aggregate(usageRows);

  return {
    isEmpty: days.length === 0,
    render: () => renderTable(days, createTable, formatRow),
    toJson: (since, until, totals, unpricedModels) =>
      buildDailyJsonOutput(group, detailed, since, until, days, totals, unpricedModels),
  };
}

function prepareSummaryReport<T extends SummaryReportData>(
  usageRows: UsageRow[],
  group: GroupMode,
  aggregate: (rows: UsageRow[]) => T,
  createTable: () => ResponsiveTable,
  formatRow: (row: T[number]) => TableRow,
): PreparedReport {
  const rows = aggregate(usageRows);

  return {
    isEmpty: rows.length === 0,
    render: (totals) => renderSummaryTable(rows, totals, createTable, formatRow),
    toJson: (since, until, totals, unpricedModels) =>
      buildSummaryJsonOutput(group, since, until, rows, totals, unpricedModels),
  };
}

function getReportModeKey(args: ParsedArgs): ReportModeKey {
  if (args.output === 'summary') {
    return args.group === 'model' ? 'summary:model' : 'summary:provider';
  }

  if (args.group === 'model') {
    return args.detailed ? 'daily:model:detailed' : 'daily:model:summary';
  }

  return args.detailed ? 'daily:provider:detailed' : 'daily:provider:summary';
}

const prepareReportByMode: Record<ReportModeKey, (usageRows: UsageRow[]) => PreparedReport> = {
  'summary:model': (usageRows) =>
    prepareSummaryReport(
      usageRows,
      'model',
      aggregateSummaryByModel,
      createSummaryModelReportTable,
      formatSummaryModelRow,
    ),
  'summary:provider': (usageRows) =>
    prepareSummaryReport(
      usageRows,
      'provider',
      aggregateSummaryByProvider,
      createSummaryProviderReportTable,
      formatSummaryProviderRow,
    ),
  'daily:model:detailed': (usageRows) =>
    prepareDailyReport(
      usageRows,
      'model',
      true,
      aggregateDailyByModel,
      createDailyModelReportTable,
      formatDailyModelSectionRow,
    ),
  'daily:model:summary': (usageRows) =>
    prepareDailyReport(
      usageRows,
      'model',
      false,
      aggregateDailySummaryByModel,
      createDailyModelSummaryTable,
      formatDailySummaryRow,
    ),
  'daily:provider:detailed': (usageRows) =>
    prepareDailyReport(
      usageRows,
      'provider',
      true,
      aggregateDailyByProvider,
      createDailyProviderReportTable,
      formatDailyProviderSectionRow,
    ),
  'daily:provider:summary': (usageRows) =>
    prepareDailyReport(
      usageRows,
      'provider',
      false,
      aggregateDailySummaryByProvider,
      createDailyProviderSummaryTable,
      formatDailySummaryRow,
    ),
};

function createPreparedReport(args: ParsedArgs, usageRows: UsageRow[]): PreparedReport {
  return prepareReportByMode[getReportModeKey(args)](usageRows);
}

async function main(): Promise<void> {
  try {
    const args = parseArgs(process.argv.slice(2));

    if (args.help) {
      printHelp();
      return;
    }

    if (args.version) {
      console.log(getVersion());
      return;
    }

    const dateRange = resolveDateRange(args.since, args.until);
    const csvText = await downloadUsageCsv(toEpochRange(dateRange));
    const usageRows = parseUsageCsv(csvText, dateRange);
    const visibleUsageRows = usageRows.filter(hasRowUsage);
    const totals = calculateTotals(visibleUsageRows);
    const unpricedModels = getUnpricedModels(visibleUsageRows);
    const usageHeader = formatUsageHeader(dateRange.since, dateRange.until);

    const report = createPreparedReport(args, visibleUsageRows);

    if (args.json) {
      console.log(
        JSON.stringify(
          report.toJson(dateRange.since, dateRange.until, totals, unpricedModels),
          null,
          2,
        ),
      );
      return;
    }

    if (report.isEmpty) {
      console.log('No Cursor usage rows found for the selected date range.');
      return;
    }

    console.log(`${usageHeader}\n`);
    console.log(report.render(totals));

    if (unpricedModels.length > 0) {
      console.error(
        `Warning: no pricing rule found for ${unpricedModels.length} model(s): ${unpricedModels.join(', ')}`,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`cstats: ${message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main();
}
