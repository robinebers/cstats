import type { DateRange, EpochRange } from './types.js';
export declare function formatDateArg(date: Date): string;
export declare function parseDateArg(value: string): Date;
export declare function getDefaultDateRange(now?: Date): DateRange;
export declare function resolveDateRange(since?: string, until?: string, now?: Date): DateRange;
export declare function toEpochRange(range: DateRange): EpochRange;
export declare function toLocalDateString(value: string): string;
export declare function formatDateCompact(date: string): string;
