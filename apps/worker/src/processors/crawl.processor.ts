import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import {
  and,
  crawlReports,
  eq,
  findings,
  inArray,
  notInArray,
  pages,
  projects,
  type Db,
} from '@zahra-seo/db';
import { DB } from '../db.module';
import { QUEUES, type CrawlJobData, type PlanJobData } from '../queues';
import { crawlSite } from '../crawler/crawler';
import { CRAWL_FINDING_KINDS, deriveFindings } from '../crawler/findings';

/**
 * OBSERVE step: budgeted crawl → pages upsert → findings upsert (+ stale
 * resolution) → crawl report → hand over to the planner.
 */
@Processor(QUEUES.crawl)
export class CrawlProcessor extends WorkerHost {
  private readonly logger = new Logger(CrawlProcessor.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @InjectQueue(QUEUES.plan) private readonly planQueue: Queue<PlanJobData>,
  ) {
    super();
  }

  async process(job: Job<CrawlJobData>): Promise<{ pages: number; findings: number }> {
    const { projectId, cycleId, maxPages } = job.data;

    const [project] = await this.db.select().from(projects).where(eq(projects.id, projectId));
    if (!project) throw new Error(`Project ${projectId} not found`);

    this.logger.log(`Crawling ${project.baseUrl} (budget: ${maxPages} pages)`);
    const result = await crawlSite(project.baseUrl, { maxPages });

    // --- pages upsert ---
    for (const page of result.pages) {
      await this.db
        .insert(pages)
        .values({
          projectId,
          url: page.url,
          canonical: page.canonical,
          title: page.title,
          metaDescription: page.metaDescription,
          statusCode: page.statusCode,
          contentHash: page.contentHash,
          lastCrawledAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [pages.projectId, pages.url],
          set: {
            canonical: page.canonical,
            title: page.title,
            metaDescription: page.metaDescription,
            statusCode: page.statusCode,
            contentHash: page.contentHash,
            lastCrawledAt: new Date(),
          },
        });
    }

    // --- findings upsert ---
    const derived = deriveFindings(result.pages, result.brokenLinks);
    for (const f of derived) {
      await this.db
        .insert(findings)
        .values({
          projectId,
          kind: f.kind,
          severity: f.severity,
          entityType: f.entityType,
          entityRef: f.entityRef,
          evidence: f.evidence,
          fingerprint: f.fingerprint,
        })
        .onConflictDoUpdate({
          target: [findings.projectId, findings.fingerprint],
          set: { evidence: f.evidence, severity: f.severity },
        });
    }

    // --- resolve crawl findings that no longer reproduce ---
    const currentFingerprints = derived.map((f) => f.fingerprint);
    const staleWhere = and(
      eq(findings.projectId, projectId),
      eq(findings.status, 'open'),
      inArray(findings.kind, [...CRAWL_FINDING_KINDS]),
      ...(currentFingerprints.length > 0 ? [notInArray(findings.fingerprint, currentFingerprints)] : []),
    );
    await this.db.update(findings).set({ status: 'resolved', resolvedAt: new Date() }).where(staleWhere);

    // --- crawl report ---
    await this.db.insert(crawlReports).values({
      projectId,
      startedAt: result.startedAt,
      finishedAt: result.finishedAt,
      pagesCount: result.pages.length,
      issues: { brokenLinks: result.brokenLinks, findingsCount: derived.length },
      lighthouseScores: {},
    });

    // --- PLAN ---
    await this.planQueue.add('plan', { projectId, cycleId }, { jobId: `plan:${cycleId}` });

    this.logger.log(`Crawl done: ${result.pages.length} pages, ${derived.length} findings`);
    return { pages: result.pages.length, findings: derived.length };
  }
}
