import { z } from 'zod';
import { ACTION_KINDS, EXECUTION_CHANNELS, SEVERITIES } from './enums';

/** Hypothesis attached to every mutating action — no hypothesis, no execution. */
export const hypothesisSchema = z.object({
  metric: z.string().min(1), // e.g. "gsc.clicks", "gsc.position", "ga4.sessions"
  scope: z.enum(['site', 'page', 'keyword', 'page_keyword']),
  scopeRef: z.string().optional(),
  direction: z.enum(['increase', 'decrease']),
  windowDays: z.union([z.literal(14), z.literal(28), z.literal(90)]).default(14),
  note: z.string().optional(),
});
export type Hypothesis = z.infer<typeof hypothesisSchema>;

export const proposedActionSchema = z.object({
  kind: z.enum(ACTION_KINDS),
  title: z.string().min(3),
  rationale: z.string().min(3),
  hypothesis: hypothesisSchema.optional(),
  input: z.record(z.unknown()).default({}),
  findingIds: z.array(z.string().uuid()).default([]),
  estimate: z.object({
    impact: z.number().min(0).max(1),
    confidence: z.number().min(0).max(1),
    effort: z.number().min(0.1).max(1),
  }),
});
export type ProposedAction = z.infer<typeof proposedActionSchema>;

export const findingSchema = z.object({
  kind: z.string(),
  severity: z.enum(SEVERITIES),
  entityType: z.enum(['page', 'keyword', 'site']),
  entityRef: z.string(),
  evidence: z.record(z.unknown()).default({}),
});
export type FindingInput = z.infer<typeof findingSchema>;

export const projectBudgetsSchema = z.object({
  maxMutatingActionsPerDay: z.number().int().min(0).default(3),
  maxArticlesPerWeek: z.number().int().min(0).default(2),
  maxCrawlPagesPerCycle: z.number().int().min(1).default(200),
  maxTokensPerCycle: z.number().int().min(0).default(200_000),
});
export type ProjectBudgets = z.infer<typeof projectBudgetsSchema>;

export const channelSchema = z.enum(EXECUTION_CHANNELS);
