import type { DateRange, UsageRow } from './types.js';
export declare function downloadUsageCsv(range: {
    startDate: number;
    endDate: number;
}): Promise<string>;
export declare function parseUsageCsv(csvText: string, range: DateRange): UsageRow[];
