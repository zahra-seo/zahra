import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { cycles, eq, projects, type Db } from '@zahra-seo/db';
import { projectBudgetsSchema } from '@zahra-seo/shared';
import { DB } from '../db.module';
import { QUEUES, type CrawlJobData, type CycleJobData } from '../queues';

/**
 * One turn of the agent loop for one project — see docs/architecture.fr.md §5.
 * Phase 1: OBSERVE (crawl) → PLAN (rule-based). ACT/MEASURE/LEARN come with
 * phases 2-4.
 */
@Processor(QUEUES.cycle)
export class CycleProcessor extends WorkerHost {
  private readonly logger = new Logger(CycleProcessor.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @InjectQueue(QUEUES.crawl) private readonly crawlQueue: Queue<CrawlJobData>,
  ) {
    super();
  }

  async process(job: Job<CycleJobData>): Promise<{ cycleId: string }> {
    const { projectId } = job.data;

    const [project] = await this.db.select().from(projects).where(eq(projects.id, projectId));
    if (!project || project.status !== 'active') {
      this.logger.warn(`Cycle skipped: project ${projectId} missing or not active`);
      return { cycleId: '' };
    }

    const [cycle] = await this.db
      .insert(cycles)
      .values({ projectId, startedAt: new Date() })
      .returning();

    const budgets = projectBudgetsSchema.parse(project.budgets ?? {});
    await this.crawlQueue.add(
      'crawl',
      { projectId, cycleId: cycle.id, maxPages: budgets.maxCrawlPagesPerCycle },
      { jobId: `crawl:${cycle.id}` },
    );

    this.logger.log(`Cycle ${cycle.id} started for "${project.name}"`);
    return { cycleId: cycle.id };
  }
}
