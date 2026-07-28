/**
 * Zahra database schema — the data model IS the contract.
 * Every table carries project_id: multi-project is native from day one.
 * See docs/architecture.fr.md §4 for the rationale behind each table.
 */
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  real,
  boolean,
  timestamp,
  date,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const projectStatus = pgEnum('project_status', ['active', 'paused', 'archived']);
export const siteAdapter = pgEnum('site_adapter', ['github_pr', 'site_api', 'both']);
export const integrationKind = pgEnum('integration_kind', ['gsc', 'ga4', 'github', 'site_api']);
export const integrationStatus = pgEnum('integration_status', ['pending', 'connected', 'error', 'revoked']);
export const findingStatus = pgEnum('finding_status', ['open', 'planned', 'resolved', 'ignored']);
export const severity = pgEnum('severity', ['low', 'medium', 'high', 'critical']);
export const metricSource = pgEnum('metric_source', ['gsc', 'ga4', 'crawl']);
export const metricScope = pgEnum('metric_scope', ['site', 'page', 'keyword', 'page_keyword']);
export const actionStatus = pgEnum('action_status', [
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
]);
export const actionSource = pgEnum('action_source', ['planner', 'rule', 'human']);
export const approvalDecision = pgEnum('approval_decision', ['approve', 'reject', 'edit']);
export const executionChannel = pgEnum('execution_channel', ['github_pr', 'site_api']);
export const evaluationVerdict = pgEnum('evaluation_verdict', [
  'success',
  'neutral',
  'regression',
  'inconclusive',
]);
export const learningKind = pgEnum('learning_kind', ['tactic_outcome', 'site_insight', 'constraint']);
export const learningStatus = pgEnum('learning_status', ['active', 'quarantined', 'expired']);
export const keywordSource = pgEnum('keyword_source', ['gsc', 'seed', 'planner']);
export const experimentStatus = pgEnum('experiment_status', ['draft', 'running', 'finished', 'aborted']);

// ---------------------------------------------------------------------------
// Referential
// ---------------------------------------------------------------------------

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  baseUrl: text('base_url').notNull(),
  status: projectStatus('status').notNull().default('active'),
  adapter: siteAdapter('adapter').notNull().default('github_pr'),
  repoOwner: text('repo_owner'),
  repoName: text('repo_name'),
  /** Per-action-kind autonomy policy — see §7. */
  autonomyPolicy: jsonb('autonomy_policy').notNull().default({}),
  /** ProjectBudgets (shared/schemas.ts). */
  budgets: jsonb('budgets').notNull().default({}),
  /** Editorial constraints: language, tone, forbidden topics… */
  editorial: jsonb('editorial').notNull().default({}),
  cycleCron: text('cycle_cron').notNull().default('0 4 * * *'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const integrations = pgTable(
  'integrations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    kind: integrationKind('kind').notNull(),
    status: integrationStatus('status').notNull().default('pending'),
    /** Non-secret config (property URL, repo adapter config…). */
    config: jsonb('config').notNull().default({}),
    /** Secrets encrypted at rest by the application layer — never stored in clear. */
    encryptedCredentials: text('encrypted_credentials'),
    lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('integrations_project_kind_idx').on(t.projectId, t.kind)],
);

export const pages = pgTable(
  'pages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    canonical: text('canonical'),
    title: text('title'),
    metaDescription: text('meta_description'),
    statusCode: integer('status_code'),
    contentHash: text('content_hash'),
    indexationState: text('indexation_state'),
    discoveredAt: timestamp('discovered_at', { withTimezone: true }).notNull().defaultNow(),
    lastCrawledAt: timestamp('last_crawled_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('pages_project_url_idx').on(t.projectId, t.url)],
);

export const keywords = pgTable(
  'keywords',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    query: text('query').notNull(),
    source: keywordSource('source').notNull().default('gsc'),
    targetPageId: uuid('target_page_id').references(() => pages.id, { onDelete: 'set null' }),
    intent: text('intent'),
    isTracked: boolean('is_tracked').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('keywords_project_query_idx').on(t.projectId, t.query)],
);

// ---------------------------------------------------------------------------
// Observation
// ---------------------------------------------------------------------------

export const crawlReports = pgTable('crawl_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  pagesCount: integer('pages_count').notNull().default(0),
  issues: jsonb('issues').notNull().default([]),
  lighthouseScores: jsonb('lighthouse_scores').notNull().default({}),
});

export const findings = pgTable(
  'findings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    severity: severity('severity').notNull(),
    status: findingStatus('status').notNull().default('open'),
    entityType: text('entity_type').notNull(), // page | keyword | site
    entityRef: text('entity_ref').notNull(), // url, query or 'site'
    evidence: jsonb('evidence').notNull().default({}),
    /** Dedup key: same kind + entity → same finding, updated not duplicated. */
    fingerprint: text('fingerprint').notNull(),
    detectedAt: timestamp('detected_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('findings_project_fingerprint_idx').on(t.projectId, t.fingerprint),
    index('findings_project_status_idx').on(t.projectId, t.status),
  ],
);

export const metricSnapshots = pgTable(
  'metric_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    source: metricSource('source').notNull(),
    scope: metricScope('scope').notNull(),
    /** url | query | url::query | 'site' */
    scopeRef: text('scope_ref').notNull(),
    /** { clicks, impressions, ctr, position, sessions, conversions… } */
    metrics: jsonb('metrics').notNull(),
  },
  (t) => [
    uniqueIndex('metric_snapshots_unique_idx').on(t.projectId, t.date, t.source, t.scope, t.scopeRef),
    index('metric_snapshots_project_date_idx').on(t.projectId, t.date),
  ],
);

// ---------------------------------------------------------------------------
// Decision & action
// ---------------------------------------------------------------------------

export const cycles = pgTable('cycles', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  phaseTimings: jsonb('phase_timings').notNull().default({}),
  plannerInputDigest: jsonb('planner_input_digest'),
  plannerOutput: jsonb('planner_output'),
  tokensUsed: integer('tokens_used').notNull().default(0),
  costEstimateCents: integer('cost_estimate_cents').notNull().default(0),
  error: text('error'),
});

export const actions = pgTable(
  'actions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    rationale: text('rationale').notNull(),
    /** Hypothesis (shared/schemas.ts) — mandatory for mutating actions. */
    hypothesis: jsonb('hypothesis'),
    input: jsonb('input').notNull().default({}),
    status: actionStatus('status').notNull().default('proposed'),
    source: actionSource('source').notNull().default('rule'),
    score: real('score').notNull().default(0),
    estimate: jsonb('estimate').notNull().default({}),
    findingIds: jsonb('finding_ids').notNull().default([]),
    createdByCycleId: uuid('created_by_cycle_id').references(() => cycles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('actions_project_status_idx').on(t.projectId, t.status)],
);

export const approvals = pgTable('approvals', {
  id: uuid('id').primaryKey().defaultRandom(),
  actionId: uuid('action_id').notNull().references(() => actions.id, { onDelete: 'cascade' }),
  decision: approvalDecision('decision').notNull(),
  decidedBy: text('decided_by').notNull(),
  comment: text('comment'),
  /** When decision = edit: the human-corrected input — a learning signal (§9). */
  editedInput: jsonb('edited_input'),
  decidedAt: timestamp('decided_at', { withTimezone: true }).notNull().defaultNow(),
});

export const actionRuns = pgTable('action_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  actionId: uuid('action_id').notNull().references(() => actions.id, { onDelete: 'cascade' }),
  executor: text('executor').notNull(),
  channel: executionChannel('channel'),
  dryRun: boolean('dry_run').notNull().default(false),
  /** DryRunReport or artifacts: pr_url, commit_sha, api_response… */
  artifacts: jsonb('artifacts').notNull().default({}),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  error: text('error'),
});

// ---------------------------------------------------------------------------
// Measurement & learning
// ---------------------------------------------------------------------------

export const evaluations = pgTable('evaluations', {
  id: uuid('id').primaryKey().defaultRandom(),
  actionId: uuid('action_id').notNull().references(() => actions.id, { onDelete: 'cascade' }),
  windowDays: integer('window_days').notNull(),
  baseline: jsonb('baseline').notNull(),
  observed: jsonb('observed').notNull(),
  delta: jsonb('delta').notNull(),
  verdict: evaluationVerdict('verdict').notNull(),
  confidence: real('confidence').notNull().default(0),
  /** Other actions on the same page, site-wide trend, suspected core update… */
  confounders: jsonb('confounders').notNull().default([]),
  evaluatedAt: timestamp('evaluated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const learnings = pgTable(
  'learnings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Null = global (cross-project) learning — generalize with care. */
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    kind: learningKind('kind').notNull(),
    status: learningStatus('status').notNull().default('active'),
    statement: text('statement').notNull(),
    evidenceActionIds: jsonb('evidence_action_ids').notNull().default([]),
    confidence: real('confidence').notNull().default(0.5),
    timesConfirmed: integer('times_confirmed').notNull().default(0),
    timesContradicted: integer('times_contradicted').notNull().default(0),
    lastConfirmedAt: timestamp('last_confirmed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('learnings_project_status_idx').on(t.projectId, t.status)],
);

export const experiments = pgTable('experiments', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  hypothesis: text('hypothesis').notNull(),
  variantConfig: jsonb('variant_config').notNull().default({}),
  pageIds: jsonb('page_ids').notNull().default([]),
  status: experimentStatus('status').notNull().default('draft'),
  result: jsonb('result'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
