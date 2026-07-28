/** Action lifecycle — see docs/architecture.fr.md §4.3 */
export const ACTION_STATUSES = [
  'proposed',
  'approved',
  'rejected',
  'queued',
  'executing',
  'executed',
  'measuring',
  'evaluated',
  'failed',
  'rolled_back',
] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];

/** Catalogue v1 — see docs/architecture.fr.md §6.3 */
export const ACTION_KINDS = [
  'technical_audit',
  'serp_snapshot',
  'fix_meta_tags',
  'add_structured_data',
  'write_article',
  'update_content',
  'internal_linking',
  'fix_sitemap_robots',
  'redirect_fix',
] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

export const FINDING_KINDS = [
  'missing_meta',
  'duplicate_meta',
  'slow_page',
  'orphan_page',
  'keyword_opportunity',
  'cannibalization',
  'broken_link',
  'thin_content',
  'redirect_chain',
  'missing_structured_data',
] as const;
export type FindingKind = (typeof FINDING_KINDS)[number];

export const FINDING_STATUSES = ['open', 'planned', 'resolved', 'ignored'] as const;
export type FindingStatus = (typeof FINDING_STATUSES)[number];

export const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const EXECUTION_CHANNELS = ['github_pr', 'site_api'] as const;
export type ExecutionChannel = (typeof EXECUTION_CHANNELS)[number];

/** Autonomy levels — see docs/architecture.fr.md §7 */
export const AUTONOMY_LEVELS = ['observe', 'approve_all', 'auto_low_risk', 'autonomous'] as const;
export type AutonomyLevel = (typeof AUTONOMY_LEVELS)[number];

export const EVALUATION_VERDICTS = ['success', 'neutral', 'regression', 'inconclusive'] as const;
export type EvaluationVerdict = (typeof EVALUATION_VERDICTS)[number];

export const INTEGRATION_KINDS = ['gsc', 'ga4', 'github', 'site_api'] as const;
export type IntegrationKind = (typeof INTEGRATION_KINDS)[number];
