/**
 * Verdict computation — pure, deterministic, deliberately conservative.
 * A verdict is a SIGNAL, never a causal certainty (§9.2 of the spec):
 * low volume → inconclusive; movement within the site-wide trend → neutral.
 */

export interface DailyMetrics {
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export type MetricKey = 'clicks' | 'impressions' | 'ctr' | 'position';
export type Verdict = 'success' | 'neutral' | 'regression' | 'inconclusive';

export interface VerdictInput {
  metricKey: MetricKey;
  /** Hypothesized direction of the RAW metric value (for position, improvement = decrease). */
  direction: 'increase' | 'decrease';
  baseline: DailyMetrics[];
  observed: DailyMetrics[];
  siteBaseline: DailyMetrics[];
  siteObserved: DailyMetrics[];
}

export interface VerdictResult {
  verdict: Verdict;
  confidence: number;
  delta: {
    baselineValue: number;
    observedValue: number;
    rawChange: number;
    siteChange: number;
    adjustedChange: number;
  };
  confounders: string[];
}

const MIN_IMPRESSIONS = 50;
const RELATIVE_THRESHOLD = 0.1; // ±10% beyond site trend
const POSITION_THRESHOLD = 1.0; // ±1 position beyond site trend

export function computeVerdict(input: VerdictInput): VerdictResult {
  const confounders: string[] = [];

  const baseVol = totalImpressions(input.baseline);
  const obsVol = totalImpressions(input.observed);
  const baselineValue = aggregate(input.baseline, input.metricKey);
  const observedValue = aggregate(input.observed, input.metricKey);

  if (baseVol < MIN_IMPRESSIONS || obsVol < MIN_IMPRESSIONS) {
    return {
      verdict: 'inconclusive',
      confidence: 0,
      delta: { baselineValue, observedValue, rawChange: 0, siteChange: 0, adjustedChange: 0 },
      confounders: ['low_volume'],
    };
  }

  const isPosition = input.metricKey === 'position';
  const rawChange = change(baselineValue, observedValue, isPosition);
  const siteBase = aggregate(input.siteBaseline, input.metricKey);
  const siteObs = aggregate(input.siteObserved, input.metricKey);
  const siteChange = siteBase > 0 || isPosition ? change(siteBase, siteObs, isPosition) : 0;
  const adjustedChange = rawChange - siteChange;

  if (Math.abs(siteChange) > (isPosition ? POSITION_THRESHOLD : RELATIVE_THRESHOLD)) {
    confounders.push('site_wide_movement');
  }

  const threshold = isPosition ? POSITION_THRESHOLD : RELATIVE_THRESHOLD;
  const wantsIncrease = input.direction === 'increase';
  const goodMove = wantsIncrease ? adjustedChange > 0 : adjustedChange < 0;
  const magnitude = Math.abs(adjustedChange);

  let verdict: Verdict = 'neutral';
  if (magnitude >= threshold) verdict = goodMove ? 'success' : 'regression';

  // Confidence grows with magnitude over threshold and with volume, capped at 0.9 —
  // never 1.0: this is observational data, not an experiment.
  const volumeFactor = Math.min(1, Math.min(baseVol, obsVol) / 1000);
  const confidence =
    verdict === 'neutral'
      ? Math.min(0.6, 0.3 + volumeFactor * 0.3)
      : Math.min(0.9, (0.4 + Math.min(1, magnitude / (threshold * 3)) * 0.3 + volumeFactor * 0.2));

  return {
    verdict,
    confidence: Number(confidence.toFixed(2)),
    delta: {
      baselineValue: round(baselineValue),
      observedValue: round(observedValue),
      rawChange: round(rawChange),
      siteChange: round(siteChange),
      adjustedChange: round(adjustedChange),
    },
    confounders,
  };
}

/** Aggregate a window: sums for volumes, recomputed ratio for ctr, impression-weighted mean for position. */
export function aggregate(days: DailyMetrics[], key: MetricKey): number {
  if (days.length === 0) return 0;
  const clicks = days.reduce((s, d) => s + d.clicks, 0);
  const impressions = days.reduce((s, d) => s + d.impressions, 0);
  switch (key) {
    case 'clicks':
      return clicks / days.length;
    case 'impressions':
      return impressions / days.length;
    case 'ctr':
      return impressions > 0 ? clicks / impressions : 0;
    case 'position': {
      if (impressions === 0) return 0;
      const weighted = days.reduce((s, d) => s + d.position * d.impressions, 0);
      return weighted / impressions;
    }
  }
}

function totalImpressions(days: DailyMetrics[]): number {
  return days.reduce((s, d) => s + d.impressions, 0);
}

/** Relative change for volume/ratio metrics; absolute difference for position. */
function change(before: number, after: number, isPosition: boolean): number {
  if (isPosition) return after - before;
  if (before === 0) return after > 0 ? 1 : 0;
  return (after - before) / before;
}

function round(n: number): number {
  return Number(n.toFixed(4));
}
