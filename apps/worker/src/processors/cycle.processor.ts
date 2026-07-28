import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { QUEUES, type CycleJobData, type CrawlJobData } from '../queues';

/**
 * One turn of the agent loop for one project — see docs/architecture.fr.md §5.
 * Phase 1: observe (crawl) → plan (rule-based planner, coming next) → no execution.
 */
@Processor(QUEUES.cycle)
export class CycleProcessor extends WorkerHost {
  private readonly logger = new Logger(CycleProcessor.name);

  constructor(@InjectQueue(QUEUES.crawl) private readonly crawlQueue: Queue<CrawlJobData>) {
    super();
  }

  async process(job: Job<CycleJobData>): Promise<void> {
    const { projectId } = job.data;
    this.logger.log(`Cycle started for project ${projectId}`);

    // OBSERVE — enqueue a budgeted crawl. Later: GSC/GA4 sync (phase 3).
    await this.crawlQueue.add(
      'crawl',
      { projectId, maxPages: 200 },
      { jobId: `crawl:${projectId}:${job.id}` },
    );

    // PLAN / ACT / MEASURE / LEARN — wired in as phase 1 & beyond progress.
    this.logger.log(`Cycle enqueued observation for project ${projectId}`);
  }
}
