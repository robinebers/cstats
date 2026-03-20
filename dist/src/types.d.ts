export type OutputMode = 'daily' | 'summary';
export type GroupMode = 'model' | 'provider';
export type AuthSource = 'sqlite' | 'keychain' | null;
export type CursorAuthState = {
    accessToken: string | null;
    refreshToken: string | null;
    source: AuthSource;
};
export type DateRange = {
    since: string;
    until: string;
};
export type EpochRange = {
    startDate: number;
    endDate: number;
};
export type UsageCsvRecord = {
    Date: string;
    Kind: string;
    Model: string;
    'Max Mode': string;
    'Input (w/ Cache Write)': string;
    'Input (w/o Cache Write)': string;
    'Cache Read': string;
    'Output Tokens': string;
    'Total Tokens': string;
    Cost: string;
};
export type UsageRow = {
    timestamp: string;
    date: string;
    kind: string;
    model: string;
    provider: string | null;
    maxMode: boolean;
    inputCacheWrite: number;
    inputNoCacheWrite: number;
    cacheRead: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCost: number;
    csvCost: string;
    canonicalModel: string | null;
};
export type ReportTotals = {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    totalTokens: number;
    totalCost: number;
};
export type ModelReportRow = {
    model: string;
} & ReportTotals;
export type ProviderReportRow = {
    provider: string;
} & ReportTotals;
export type DailyModelSection = {
    date: string;
    rows: ModelReportRow[];
    totals: ReportTotals;
};
export type DailyProviderSection = {
    date: string;
    rows: ProviderReportRow[];
    totals: ReportTotals;
};
export type DailySummarySection = {
    date: string;
    labels: string[];
    totals: ReportTotals;
};
export type ReportWarnings = {
    unpricedModels: string[];
};
export type DailyJsonOutput = {
    output: 'daily';
    group: GroupMode;
    detailed: boolean;
    since: string;
    until: string;
    days: DailySummarySection[] | DailyModelSection[] | DailyProviderSection[];
    totals: ReportTotals;
    warnings: ReportWarnings;
};
export type SummaryJsonOutput = {
    output: 'summary';
    group: GroupMode;
    since: string;
    until: string;
    rows: ModelReportRow[] | ProviderReportRow[];
    totals: ReportTotals;
    warnings: ReportWarnings;
};
export type JsonOutput = DailyJsonOutput | SummaryJsonOutput;
export type PricingEntry = {
    display_name: string;
    provider: string;
    input_per_million: number;
    cache_write_per_million: number;
    cache_read_per_million: number;
    output_per_million: number;
    apply_max_mode_uplift: boolean;
    long_context_input_threshold?: number;
    long_context_input_multiplier?: number;
    long_context_output_multiplier?: number;
    long_context_cached_input_multiplier?: number;
    source_url: string;
    notes: string;
};
export type AliasRule = {
    pattern: string;
    canonical: string;
    reason: string;
};
export type PricingManifest = {
    retrieved_at: string;
    pricing: Record<string, PricingEntry>;
    alias_rules: AliasRule[];
};
export type ParsedArgs = {
    since?: string;
    until?: string;
    json: boolean;
    output: OutputMode;
    group: GroupMode;
    detailed: boolean;
    help: boolean;
    version: boolean;
};
