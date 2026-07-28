import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUES, type CrawlJobData } from '../queues';

/**
 * Budgeted internal crawler — phase 1 workhorse.
 * TODO(phase 1): sitemap fetch, link-follow via Playwright, meta extraction,
 * Lighthouse on a sample, findings production. Respects robots.txt,
 * identifies as ZahraBot.
 */
@Processor(QUEUES.crawl)
export class CrawlProcessor extends WorkerHost {
  private readonly logger = new Logger(CrawlProcessor.name);

  async process(job: Job<CrawlJobData>): Promise<void> {
    const { projectId, maxPages } = job.data;
    this.logger.log(`Crawl requested for project ${projectId} (budget: ${maxPages} pages) — not implemented yet`);
  }
}
