import { z } from 'zod';
import type { LlmProvider } from '@zahra-seo/core';
import { fixMetaTagsInputSchema } from '@zahra-seo/tools';
import type { ProjectDigest } from './digest';

/**
 * Planner v1 — Claude behind the LlmProvider interface.
 * Receives the digest, returns fully-drafted actions (including the actual
 * meta values), validated twice: zod on the envelope, then the target tool's
 * inputSchema on each executable input. The deterministic scorer still owns
 * the final priority — the model only estimates.
 */

const plannedActionSchema = z.object({
  findingId: z.string(),
  kind: z.enum(['fix_meta_tags', 'update_content', 'redirect_fix']),
  title: z.string().min(3).max(120),
  rationale: z.string().min(10).max(600),
  hypothesis: z.object({
    metric: z.string(),
    scope: z.enum(['site', 'page', 'keyword', 'page_keyword']),
    scopeRef: z.string(),
    direction: z.enum(['increase', 'decrease']),
    windowDays: z.number().int().min(7).max(90),
  }),
  input: z.record(z.unknown()),
  estimate: z.object({
    impact: z.number().min(0).max(1),
    confidence: z.number().min(0).max(1),
    effort: z.number().min(0.1).max(1),
  }),
});
const plannerOutputSchema = z.object({ actions: z.array(plannedActionSchema).max(20) });
export type PlannedAction = z.infer<typeof plannedActionSchema>;

/** JSON Schema mirror of the zod envelope — sent to the provider as the tool schema. */
const PLANNER_JSON_SCHEMA = {
  type: 'object',
  required: ['actions'],
  properties: {
    actions: {
      type: 'array',
      maxItems: 20,
      items: {
        type: 'object',
        required: ['findingId', 'kind', 'title', 'rationale', 'hypothesis', 'input', 'estimate'],
        properties: {
          findingId: { type: 'string', description: 'id of the finding this action addresses' },
          kind: { type: 'string', enum: ['fix_meta_tags', 'update_content', 'redirect_fix'] },
          title: { type: 'string', description: 'Short imperative title, language of the site' },
          rationale: { type: 'string', description: 'Why this action, citing the evidence' },
          hypothesis: {
            type: 'object',
            required: ['metric', 'scope', 'scopeRef', 'direction', 'windowDays'],
            properties: {
              metric: { type: 'string', description: 'e.g. gsc.ctr, gsc.position, crawl.broken_links. direction refers to the RAW value: for gsc.position, improvement = decrease.' },
              scope: { type: 'string', enum: ['site', 'page', 'keyword', 'page_keyword'] },
              scopeRef: { type: 'string' },
              direction: { type: 'string', enum: ['increase', 'decrease'] },
              windowDays: { type: 'integer', minimum: 7, maximum: 90 },
            },
          },
          input: {
            type: 'object',
            description:
              'Tool input. For fix_meta_tags: { "url": string, "overrides": { "title"?: string (5-70 chars), ' +
              '"metaDescription"?: string (30-170 chars) } } — DRAFT the actual values.',
          },
          estimate: {
            type: 'object',
            required: ['impact', 'confidence', 'effort'],
            properties: {
              impact: { type: 'number', minimum: 0, maximum: 1 },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
              effort: { type: 'number', minimum: 0.1, maximum: 1 },
            },
          },
        },
      },
    },
  },
} as const;

const SYSTEM = `You are the planning module of Zahra, an autonomous SEO engineer.
You receive a compact digest of a website's current SEO state (findings with evidence,
current page metadata, backlog summary, editorial constraints).

Rules — non negotiable:
- Propose at most one action per finding, only for findings you can genuinely improve.
- For fix_meta_tags you MUST draft the final values yourself (title ≤ 60 chars,
  metaDescription 140-160 chars ideally), in the language of the site's content,
  factual, specific to the page, no clickbait, no keyword stuffing.
- Respect editorial constraints from the digest (language, tone, forbidden topics).
- Be conservative on estimates: confidence reflects real uncertainty.
- Never invent pages, metrics or evidence not present in the digest.
- Skip a finding rather than proposing a weak or generic action.`;

export interface ClaudePlanResult {
  actions: PlannedAction[];
  usage: { inputTokens: number; outputTokens: number };
  model: string;
  skipped: number;
}

export async function planWithClaude(provider: LlmProvider, digest: ProjectDigest): Promise<ClaudePlanResult> {
  const response = await provider.generateStructured({
    system: SYSTEM,
    prompt:
      `Here is the project digest (JSON):\n\n${JSON.stringify(digest, null, 2)}\n\n` +
      `Propose the actions worth taking now. Draft all content values yourself.`,
    schema: PLANNER_JSON_SCHEMA as unknown as Record<string, unknown>,
    schemaName: 'propose_actions',
    maxTokens: 8192,
  });

  const parsed = plannerOutputSchema.parse(response.data);

  // Second gate: each executable input must satisfy its tool's schema.
  const valid: PlannedAction[] = [];
  let skipped = 0;
  for (const action of parsed.actions) {
    if (action.kind === 'fix_meta_tags') {
      const check = fixMetaTagsInputSchema.safeParse(action.input);
      if (!check.success) {
        skipped += 1;
        continue;
      }
    }
    valid.push(action);
  }

  return { actions: valid, usage: response.usage, model: response.model, skipped };
}
