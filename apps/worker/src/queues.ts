/** Single source of truth for queue names. Every job payload carries projectId. */
export const QUEUES = {
  /** One repeatable job per project (cycle_cron) — orchestrates a full loop turn. */
  cycle: 'zahra.cycle',
  /** Budgeted site crawl (sitemap + link-follow + lighthouse sample). */
  crawl: 'zahra.crawl',
  /** Execution of a single approved action. */
  execute: 'zahra.execute',
  /** Evaluation of actions whose measurement window has elapsed. */
  evaluate: 'zahra.evaluate',
} as const;

export interface CycleJobData {
  projectId: string;
}

export interface CrawlJobData {
  projectId: string;
  maxPages: number;
}

export interface ExecuteJobData {
  projectId: string;
  actionId: string;
}

export interface EvaluateJobData {
  projectId: string;
  actionId: string;
}
