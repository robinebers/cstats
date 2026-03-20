const UNKNOWN_PROVIDER = 'unknown';
function createEmptyTotals() {
    return {
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        totalTokens: 0,
        totalCost: 0,
    };
}
function addRowTotals(target, row) {
    target.inputTokens += row.inputNoCacheWrite;
    target.outputTokens += row.outputTokens;
    target.cacheCreationTokens += row.inputCacheWrite;
    target.cacheReadTokens += row.cacheRead;
    target.totalTokens += row.totalTokens;
    target.totalCost += row.estimatedCost;
}
export function calculateTotals(rows) {
    const totals = createEmptyTotals();
    for (const row of rows) {
        addRowTotals(totals, row);
    }
    return totals;
}
function sortByCostThenLabel(rows, getLabel) {
    return rows.sort((left, right) => {
        if (right.totalCost !== left.totalCost) {
            return right.totalCost - left.totalCost;
        }
        return getLabel(left).localeCompare(getLabel(right));
    });
}
function aggregateDaily(rows, getKey, buildRow, getLabel) {
    const groupedByDate = new Map();
    for (const row of rows) {
        const dateEntry = groupedByDate.get(row.date) ?? {
            rowsByKey: new Map(),
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
export function aggregateDailyByModel(rows) {
    return aggregateDaily(rows, (row) => row.model, (model, totals) => ({
        model,
        ...totals,
    }), (row) => row.model);
}
export function aggregateDailyByProvider(rows) {
    return aggregateDaily(rows, (row) => row.provider ?? UNKNOWN_PROVIDER, (provider, totals) => ({
        provider,
        ...totals,
    }), (row) => row.provider);
}
export function aggregateSummaryByModel(rows) {
    return aggregateSummary(rows, (row) => row.model, (model, totals) => ({
        model,
        ...totals,
    }), (row) => row.model);
}
export function aggregateSummaryByProvider(rows) {
    return aggregateSummary(rows, (row) => row.provider ?? UNKNOWN_PROVIDER, (provider, totals) => ({
        provider,
        ...totals,
    }), (row) => row.provider);
}
export function aggregateDailySummaryByModel(rows) {
    return aggregateDailySummary(rows, (row) => row.model);
}
export function aggregateDailySummaryByProvider(rows) {
    return aggregateDailySummary(rows, (row) => row.provider ?? UNKNOWN_PROVIDER);
}
function aggregateDailySummary(rows, getLabel) {
    const groupedByDate = new Map();
    for (const row of rows) {
        const entry = groupedByDate.get(row.date) ?? {
            labels: new Set(),
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
function aggregateSummary(rows, getKey, buildRow, getLabel) {
    const grouped = new Map();
    for (const row of rows) {
        const key = getKey(row);
        const totals = grouped.get(key) ?? createEmptyTotals();
        addRowTotals(totals, row);
        grouped.set(key, totals);
    }
    const summaryRows = Array.from(grouped.entries()).map(([key, totals]) => buildRow(key, totals));
    return sortByCostThenLabel(summaryRows, getLabel);
}
//# sourceMappingURL=aggregate.js.map