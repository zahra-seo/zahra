import { describe, expect, it } from 'vitest';
import { MEMORY_MODIFIER_MAX, MEMORY_MODIFIER_MIN, scoreAction } from '../src/scoring';

describe('scoreAction', () => {
  it('computes (impact × confidence) / effort', () => {
    expect(scoreAction({ impact: 0.5, confidence: 0.8, effort: 0.2 })).toBeCloseTo(2.0);
  });

  it('never divides by less than 0.1 effort', () => {
    expect(scoreAction({ impact: 1, confidence: 1, effort: 0 })).toBeCloseTo(10);
  });

  it('bounds the memory modifier to [0.5, 2]', () => {
    const base = scoreAction({ impact: 0.5, confidence: 0.8, effort: 0.2 });
    expect(scoreAction({ impact: 0.5, confidence: 0.8, effort: 0.2, memoryModifier: 100 })).toBeCloseTo(base * MEMORY_MODIFIER_MAX);
    expect(scoreAction({ impact: 0.5, confidence: 0.8, effort: 0.2, memoryModifier: 0 })).toBeCloseTo(base * MEMORY_MODIFIER_MIN);
  });

  it('drifts old findings up, capped at +25%', () => {
    const fresh = scoreAction({ impact: 0.5, confidence: 0.8, effort: 0.2, findingAgeDays: 0 });
    const old = scoreAction({ impact: 0.5, confidence: 0.8, effort: 0.2, findingAgeDays: 70 });
    const ancient = scoreAction({ impact: 0.5, confidence: 0.8, effort: 0.2, findingAgeDays: 10000 });
    expect(old).toBeCloseTo(fresh * 1.1);
    expect(ancient).toBeCloseTo(fresh * 1.25);
  });
});
