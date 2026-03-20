import type { PricingEntry, UsageRow } from './types.js';
export declare function resolveCanonicalModel(model: string): string | null;
export declare function getPricingEntry(model: string): PricingEntry | null;
export declare function getProvider(model: string): string | null;
export declare function estimateRowCost(row: Pick<UsageRow, 'model' | 'maxMode' | 'inputCacheWrite' | 'inputNoCacheWrite' | 'cacheRead' | 'outputTokens'>): {
    canonicalModel: string | null;
    provider: string | null;
    estimatedCost: number;
};
export declare function getUnpricedModels(rows: UsageRow[]): string[];
