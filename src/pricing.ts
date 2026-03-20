import { pricingManifest } from './pricing-manifest.js';
import type { PricingEntry, UsageRow } from './types.js';

const MAX_MODE_UPLIFT = 1.2;

function resolvePricing(model: string): { canonicalModel: string; pricing: PricingEntry } | null {
  const canonicalModel = resolveCanonicalModel(model);
  if (canonicalModel === null) {
    return null;
  }

  const pricing = pricingManifest.pricing[canonicalModel];
  if (pricing === undefined) {
    return null;
  }

  return { canonicalModel, pricing };
}

export function resolveCanonicalModel(model: string): string | null {
  for (const rule of pricingManifest.alias_rules) {
    const pattern = new RegExp(rule.pattern);
    if (pattern.test(model)) {
      return rule.canonical;
    }
  }

  return null;
}

export function getPricingEntry(model: string): PricingEntry | null {
  return resolvePricing(model)?.pricing ?? null;
}

export function getProvider(model: string): string | null {
  return resolvePricing(model)?.pricing.provider ?? null;
}

export function estimateRowCost(row: Pick<
  UsageRow,
  'model' | 'maxMode' | 'inputCacheWrite' | 'inputNoCacheWrite' | 'cacheRead' | 'outputTokens'
>): { canonicalModel: string | null; provider: string | null; estimatedCost: number } {
  const resolved = resolvePricing(row.model);
  if (resolved === null) {
    return { canonicalModel: null, provider: null, estimatedCost: 0 };
  }

  const { canonicalModel, pricing } = resolved;

  const totalInputTokens = row.inputCacheWrite + row.inputNoCacheWrite + row.cacheRead;
  let inputMultiplier = 1.0;
  let outputMultiplier = 1.0;
  let cachedInputMultiplier = 1.0;

  if (
    pricing.long_context_input_threshold !== undefined &&
    totalInputTokens > pricing.long_context_input_threshold
  ) {
    inputMultiplier = pricing.long_context_input_multiplier ?? 1.0;
    outputMultiplier = pricing.long_context_output_multiplier ?? 1.0;
    cachedInputMultiplier =
      pricing.long_context_cached_input_multiplier ?? inputMultiplier;
  }

  let estimatedCost =
    (row.inputCacheWrite / 1_000_000) *
      pricing.cache_write_per_million *
      inputMultiplier +
    (row.inputNoCacheWrite / 1_000_000) *
      pricing.input_per_million *
      inputMultiplier +
    (row.cacheRead / 1_000_000) *
      pricing.cache_read_per_million *
      cachedInputMultiplier +
    (row.outputTokens / 1_000_000) *
      pricing.output_per_million *
      outputMultiplier;

  if (row.maxMode && pricing.apply_max_mode_uplift) {
    estimatedCost *= MAX_MODE_UPLIFT;
  }

  return { canonicalModel, provider: pricing.provider, estimatedCost };
}

export function getUnpricedModels(rows: UsageRow[]): string[] {
  return Array.from(
    new Set(rows.filter((row) => row.canonicalModel === null).map((row) => row.model)),
  ).sort((left, right) => left.localeCompare(right));
}
