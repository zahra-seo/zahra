/**
 * Deterministic scorer — see docs/architecture.fr.md §5.3.
 * The LLM proposes estimates; the final priority is recomputed here,
 * outside the model, so it stays inspectable and bounded.
 */
export interface ScoreInput {
  impact: number;      // 0..1, planner estimate
  confidence: number;  // 0..1, planner estimate
  effort: number;      // 0.1..1, planner estimate
  /** Phase 4: learned modifier per action kind on this project. Bounded. */
  memoryModifier?: number;
  /** Age of the underlying finding in days — old untreated findings drift up slowly. */
  findingAgeDays?: number;
}

export const MEMORY_MODIFIER_MIN = 0.5;
export const MEMORY_MODIFIER_MAX = 2;

export function scoreAction(input: ScoreInput): number {
  const effort = Math.max(input.effort, 0.1);
  const base = (input.impact * input.confidence) / effort;

  const memory = clamp(input.memoryModifier ?? 1, MEMORY_MODIFIER_MIN, MEMORY_MODIFIER_MAX);

  // +1% per week of age, capped at +25% — a gentle nudge, not a takeover.
  const ageWeeks = (input.findingAgeDays ?? 0) / 7;
  const freshness = Math.min(1 + ageWeeks * 0.01, 1.25);

  return base * memory * freshness;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}
