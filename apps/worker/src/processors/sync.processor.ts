import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { and, desc, eq, integrations, metricSnapshots, type Db } from '@zahra-seo/db';
import { SearchConsoleClient, loadServiceAccount } from '@zahra-seo/connectors';
import { DB } from '../db.module';
import { QUEUES, type SyncJobData } from '../queues';

/**
 * OBSERVE step, external data: incremental metric syncs into metric_snapshots.
 * GSC data is final with ~2 days of latency, so every run re-fetches a 3-day
 * revision window behind the last synced date (upserts keep it idempotent).
 */
@Processor(QUEUES.sync)
export class SyncProcessor extends WorkerHost {
  private readonly logger = new Logger(SyncProcessor.name);

  constructor(@Inject(DB) private readonly db: Db) {
    super();
  }

  async process(job: Job<SyncJobData>): Promise<{ rows: number }> {
    const { projectId, kind } = job.data;
    if (kind !== 'gsc') {
      this.logger.warn(`Sync kind "${kind}" not implemented yet`);
      return { rows: 0 };
    }
    return this.syncGsc(projectId);
  }

  private async syncGsc(projectId: string): Promise<{ rows: number }> {
    const [integration] = await this.db
      .select()
      .from(integrations)
      .where(and(eq(integrations.projectId, projectId), eq(integrations.kind, 'gsc')));
    if (!integration) {
      this.logger.warn(`No GSC integration configured for project ${projectId} — skipping`);
      return { rows: 0 };
    }
    const { siteUrl } = (integration.config ?? {}) as { siteUrl?: string };
    if (!siteUrl) throw new Error('GSC integration has no siteUrl in config');

    const account = loadServiceAccount();
    if (!account) throw new Error('No Google service account configured (GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS)');

    // Incremental window: from (last synced date - 3d revisions) to (today - 2d latency);
    // first sync backfills 28 days.
    const [latest] = await this.db
      .select({ date: metricSnapshots.date })
      .from(metricSnapshots)
      .where(and(eq(metricSnapshots.projectId, projectId), eq(metricSnapshots.source, 'gsc')))
      .orderBy(desc(metricSnapshots.date))
      .limit(1);

    const end = dateStr(daysAgo(2));
    const start = latest ? dateStr(addDays(new Date(latest.date), -3)) : dateStr(daysAgo(30));
    if (start > end) {
      this.logger.log('GSC sync: nothing new yet (data latency)');
      return { rows: 0 };
    }

    const gsc = new SearchConsoleClient(account);
    const [siteDays, pageQueryRows] = [
      await gsc.siteDaily(siteUrl, start, end),
      await gsc.pageQueryDaily(siteUrl, start, end),
    ];

    let rows = 0;
    for (const day of siteDays) {
      await this.upsert(projectId, day.date, 'site', 'site', {
        clicks: day.clicks,
        impressions: day.impressions,
        ctr: day.ctr,
        position: day.position,
      });
      rows += 1;
    }
    for (const row of pageQueryRows) {
      await this.upsert(projectId, row.date, 'page_keyword', `${row.page}::${row.query}`, {
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        position: row.position,
      });
      rows += 1;
    }

    await this.db
      .update(integrations)
      .set({ status: 'connected', lastSyncAt: new Date() })
      .where(eq(integrations.id, integration.id));

    this.logger.log(`GSC sync ${start} → ${end}: ${rows} snapshot(s) for ${siteUrl}`);
    return { rows };
  }

  private async upsert(
    projectId: string,
    date: string,
    scope: 'site' | 'page' | 'keyword' | 'page_keyword',
    scopeRef: string,
    metrics: Record<string, number>,
  ): Promise<void> {
    await this.db
      .insert(metricSnapshots)
      .values({ projectId, date, source: 'gsc', scope, scopeRef, metrics })
      .onConflictDoUpdate({
        target: [
          metricSnapshots.projectId,
          metricSnapshots.date,
          metricSnapshots.source,
          metricSnapshots.scope,
          metricSnapshots.scopeRef,
        ],
        set: { metrics },
      });
  }
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}
function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setUTCDate(c.getUTCDate() + n);
  return c;
}
function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}
