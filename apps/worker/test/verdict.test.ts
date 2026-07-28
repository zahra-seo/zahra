import { describe, expect, it } from 'vitest';
import { aggregate, computeVerdict, type DailyMetrics } from '../src/evaluator/verdict';

function days(n: number, m: Partial<DailyMetrics>): DailyMetrics[] {
  return Array.from({ length: n }, (_, i) => ({
    date: `2026-07-${String(i + 1).padStart(2, '0')}`,
    clicks: 10,
    impressions: 200,
    ctr: 0.05,
    position: 12,
    ...m,
  }));
}

describe('computeVerdict', () => {
  it('returns inconclusive on low volume', () => {
    const r = computeVerdict({
      metricKey: 'ctr',
      direction: 'increase',
      baseline: days(14, { impressions: 2, clicks: 0 }),
      observed: days(14, { impressions: 2, clicks: 1 }),
      siteBaseline: days(14, {}),
      siteObserved: days(14, {}),
    });
    expect(r.verdict).toBe('inconclusive');
    expect(r.confounders).toContain('low_volume');
  });

  it('declares success when CTR rises well beyond the site trend', () => {
    const r = computeVerdict({
      metricKey: 'ctr',
      direction: 'increase',
      baseline: days(14, { clicks: 10, impressions: 200 }),   // ctr 5%
      observed: days(14, { clicks: 14, impressions: 200 }),   // ctr 7% → +40%
      siteBaseline: days(14, { clicks: 100, impressions: 2000 }),
      siteObserved: days(14, { clicks: 100, impressions: 2000 }), // site flat
    });
    expect(r.verdict).toBe('success');
    expect(r.confidence).toBeGreaterThan(0.4);
    expect(r.confidence).toBeLessThanOrEqual(0.9);
  });

  it('stays neutral when the page only follows a site-wide movement', () => {
    const r = computeVerdict({
      metricKey: 'ctr',
      direction: 'increase',
      baseline: days(14, { clicks: 10, impressions: 200 }),
      observed: days(14, { clicks: 12, impressions: 200 }),   // +20%…
      siteBaseline: days(14, { clicks: 100, impressions: 2000 }),
      siteObserved: days(14, { clicks: 120, impressions: 2000 }), // …site +20% too
    });
    expect(r.verdict).toBe('neutral');
    expect(r.confounders).toContain('site_wide_movement');
  });

  it('treats a position drop (numeric decrease) as the good direction', () => {
    const r = computeVerdict({
      metricKey: 'position',
      direction: 'decrease',
      baseline: days(14, { position: 12 }),
      observed: days(14, { position: 8 }),
      siteBaseline: days(14, { position: 15 }),
      siteObserved: days(14, { position: 15 }),
    });
    expect(r.verdict).toBe('success');
  });

  it('flags regression when the metric moves against the hypothesis', () => {
    const r = computeVerdict({
      metricKey: 'ctr',
      direction: 'increase',
      baseline: days(14, { clicks: 14, impressions: 200 }),
      observed: days(14, { clicks: 10, impressions: 200 }),
      siteBaseline: days(14, { clicks: 100, impressions: 2000 }),
      siteObserved: days(14, { clicks: 100, impressions: 2000 }),
    });
    expect(r.verdict).toBe('regression');
  });
});

describe('aggregate', () => {
  it('recomputes ctr from sums and weights position by impressions', () => {
    const win: DailyMetrics[] = [
      { date: 'a', clicks: 10, impressions: 100, ctr: 0.1, position: 5 },
      { date: 'b', clicks: 0, impressions: 300, ctr: 0, position: 20 },
    ];
    expect(aggregate(win, 'ctr')).toBeCloseTo(10 / 400);
    expect(aggregate(win, 'position')).toBeCloseTo((5 * 100 + 20 * 300) / 400);
  });
});
