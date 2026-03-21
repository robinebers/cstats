import type {
  DailySection,
  DailyModelSection,
  DailyProviderSection,
  DailySummarySection,
  ModelReportRow,
  ProviderReportRow,
  ReportTotals,
  UsageRow,
} from './types.js';

const UNKNOWN_PROVIDER = 'unknown';

function createEmptyTotals(): ReportTotals {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    totalTokens: 0,
    totalCost: 0,
  };
}

export function hasRowUsage(row: UsageRow): boolean {
  return (
    row.inputNoCacheWrite !== 0 ||
    row.outputTokens !== 0 ||
    row.inputCacheWrite !== 0 ||
    row.cacheRead !== 0 ||
    row.totalTokens !== 0 ||
    row.estimatedCost !== 0
  );
}

function addRowTotals(target: ReportTotals, row: UsageRow): void {
  target.inputTokens += row.inputNoCacheWrite;
  target.outputTokens += row.outputTokens;
  target.cacheCreationTokens += row.inputCacheWrite;
  target.cacheReadTokens += row.cacheRead;
  target.totalTokens += row.totalTokens;
  target.totalCost += row.estimatedCost;
}

export function calculateTotals(rows: UsageRow[]): ReportTotals {
  const totals = createEmptyTotals();
  for (const row of rows) {
    addRowTotals(totals, row);
  }
  return totals;
}

function sortByCostThenLabel<T extends ReportTotals>(
  rows: T[],
  getLabel: (row: T) => string,
): T[] {
  return rows.sort((left, right) => {
    if (right.totalCost !== left.totalCost) {
      return right.totalCost - left.totalCost;
    }

    return getLabel(left).localeCompare(getLabel(right));
  });
}

function aggregateDaily<RowType extends ReportTotals>(
  rows: UsageRow[],
  getKey: (row: UsageRow) => string,
  buildRow: (key: string, totals: ReportTotals) => RowType,
  getLabel: (row: RowType) => string,
): Array<DailySection<RowType>> {
  const groupedByDate = new Map<
    string,
    {
      rowsByKey: Map<string, ReportTotals>;
      totals: ReportTotals;
    }
  >();

  for (const row of rows) {
    if (!hasRowUsage(row)) {
      continue;
    }

    const dateEntry = groupedByDate.get(row.date) ?? {
      rowsByKey: new Map<string, ReportTotals>(),
      totals: createEmptyTotals(),
    };
    const key = getKey(row);
    const rowTotals = dateEntry.rowsByKey.get(key) ?? createEmptyTotals();

    addRowTotals(rowTotals, row);
    addRowTotals(dateEntry.totals, row);

    dateEntry.rowsByKey.set(key, rowTotals);
    groupedByDate.set(row.date, dateEntry);
  }

  return Array.from(groupedByDate.entries())
    .map(([date, value]) => {
      const dayRows = Array.from(value.rowsByKey.entries()).map(([key, totals]) => buildRow(key, totals));
      return {
        date,
        rows: sortByCostThenLabel(dayRows, getLabel),
        totals: value.totals,
      };
    })
    .sort((left, right) => left.date.localeCompare(right.date));
}

export function aggregateDailyByModel(rows: UsageRow[]): DailyModelSection[] {
  return aggregateDaily(
    rows,
    (row) => row.model,
    (model, totals) => ({
      model,
      ...totals,
    }),
    (row) => row.model,
  );
}

export function aggregateDailyByProvider(rows: UsageRow[]): DailyProviderSection[] {
  return aggregateDaily(
    rows,
    (row) => row.provider ?? UNKNOWN_PROVIDER,
    (provider, totals) => ({
      provider,
      ...totals,
    }),
    (row) => row.provider,
  );
}

export function aggregateSummaryByModel(rows: UsageRow[]): ModelReportRow[] {
  return aggregateSummary(
    rows,
    (row) => row.model,
    (model, totals) => ({
      model,
      ...totals,
    }),
    (row) => row.model,
  );
}

export function aggregateSummaryByProvider(rows: UsageRow[]): ProviderReportRow[] {
  return aggregateSummary(
    rows,
    (row) => row.provider ?? UNKNOWN_PROVIDER,
    (provider, totals) => ({
      provider,
      ...totals,
    }),
    (row) => row.provider,
  );
}

export function aggregateDailySummaryByModel(rows: UsageRow[]): DailySummarySection[] {
  return aggregateDailySummary(rows, (row) => row.model);
}

export function aggregateDailySummaryByProvider(rows: UsageRow[]): DailySummarySection[] {
  return aggregateDailySummary(rows, (row) => row.provider ?? UNKNOWN_PROVIDER);
}

function aggregateDailySummary(
  rows: UsageRow[],
  getLabel: (row: UsageRow) => string,
): DailySummarySection[] {
  const groupedByDate = new Map<
    string,
    {
      labels: Set<string>;
      totals: ReportTotals;
    }
  >();

  for (const row of rows) {
    if (!hasRowUsage(row)) {
      continue;
    }

    const entry = groupedByDate.get(row.date) ?? {
      labels: new Set<string>(),
      totals: createEmptyTotals(),
    };
    entry.labels.add(getLabel(row));
    addRowTotals(entry.totals, row);
    groupedByDate.set(row.date, entry);
  }

  return Array.from(groupedByDate.entries())
    .map(([date, value]) => ({
      date,
      labels: Array.from(value.labels).sort((left, right) => left.localeCompare(right)),
      totals: value.totals,
    }))
    .sort((left, right) => left.date.localeCompare(right.date));
}

function aggregateSummary<RowType extends ReportTotals>(
  rows: UsageRow[],
  getKey: (row: UsageRow) => string,
  buildRow: (key: string, totals: ReportTotals) => RowType,
  getLabel: (row: RowType) => string,
): RowType[] {
  const grouped = new Map<string, ReportTotals>();

  for (const row of rows) {
    if (!hasRowUsage(row)) {
      continue;
    }

    const key = getKey(row);
    const totals = grouped.get(key) ?? createEmptyTotals();
    addRowTotals(totals, row);
    grouped.set(key, totals);
  }

  const summaryRows = Array.from(grouped.entries()).map(([key, totals]) => buildRow(key, totals));
  return sortByCostThenLabel(summaryRows, getLabel);
}
