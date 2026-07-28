/** Queue names shared by api (producers) and worker (consumers). */
export const QUEUES = {
  cycle: 'zahra.cycle',
  crawl: 'zahra.crawl',
  plan: 'zahra.plan',
  execute: 'zahra.execute',
  evaluate: 'zahra.evaluate',
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
