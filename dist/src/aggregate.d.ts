import type { DailyModelSection, DailyProviderSection, DailySummarySection, ModelReportRow, ProviderReportRow, ReportTotals, UsageRow } from './types.js';
export declare function calculateTotals(rows: UsageRow[]): ReportTotals;
export declare function aggregateDailyByModel(rows: UsageRow[]): DailyModelSection[];
export declare function aggregateDailyByProvider(rows: UsageRow[]): DailyProviderSection[];
export declare function aggregateSummaryByModel(rows: UsageRow[]): ModelReportRow[];
export declare function aggregateSummaryByProvider(rows: UsageRow[]): ProviderReportRow[];
export declare function aggregateDailySummaryByModel(rows: UsageRow[]): DailySummarySection[];
export declare function aggregateDailySummaryByProvider(rows: UsageRow[]): DailySummarySection[];
