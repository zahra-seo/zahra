/** Queue names shared by api (producers) and worker (consumers). */
export const QUEUES = {
  /** One repeatable job per project (cycle_cron) — a full agent loop turn. */
  cycle: 'zahra.cycle',
  /** Budgeted site crawl (robots + sitemap + link-follow). */
  crawl: 'zahra.crawl',
  /** Planner: findings → proposed actions (Claude or rules). */
  plan: 'zahra.plan',
  /** Execution of one approved action through its tool. */
  execute: 'zahra.execute',
  /** Evaluation of actions whose measurement window has elapsed. */
  evaluate: 'zahra.evaluate',
  /** Metric syncs from external sources (gsc, ga4). */
  sync: 'zahra.sync',
} as const;

export interface CycleJobData {
  projectId: string;
}

export interface CrawlJobData {
  projectId: string;
  cycleId: string;
  maxPages: number;
}

export interface PlanJobData {
  projectId: string;
  cycleId: string;
}

export interface ExecuteJobData {
  projectId: string;
  actionId: string;
}

export interface EvaluateJobData {
  projectId: string;
  actionId: string;
}

export interface SyncJobData {
  projectId: string;
  kind: 'gsc' | 'ga4';
}
