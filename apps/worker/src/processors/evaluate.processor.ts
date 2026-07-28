import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { actions, and, eq, evaluations, gte, like, lte, metricSnapshots, or, type Db } from '@zahra-seo/db';
import { DB } from '../db.module';
import { QUEUES, type EvaluateJobData } from '../queues';
import { aggregate, computeVerdict, type DailyMetrics, type MetricKey } from '../evaluator/verdict';

interface Hypothesis {
  metric: string;
  scope: string;
  scopeRef: string;
  direction: 'increase' | 'decrease';
  windowDays?: number;
}

/**
 * MEASURE step — runs when an action's measurement window elapses.
 * Baseline = windowDays before execution; observed = windowDays after.
 * Both are read from immutable daily snapshots, adjusted for the site-wide
 * trend, and judged conservatively (inconclusive is a valid, honest verdict).
 */
@Processor(QUEUES.evaluate)
export class EvaluateProcessor extends WorkerHost {
  private readonly logger = new Logger(EvaluateProcessor.name);

  constructor(@Inject(DB) private readonly db: Db) {
    super();
  }

  async process(job: Job<EvaluateJobData>): Promise<{ verdict: string }> {
    const { actionId, projectId } = job.data;

    const [action] = await this.db.select().from(actions).where(eq(actions.id, actionId));
    if (!action) throw new Error(`Action ${actionId} not found`);
    if (action.status !== 'measuring') {
      this.logger.warn(`Action ${actionId} is "${action.status}", expected "measuring" — skipping`);
      return { verdict: 'skipped' };
    }

    const hypothesis = action.hypothesis as Hypothesis | null;
    const windowDays = hypothesis?.windowDays ?? 14;
    const executedAt = action.updatedAt;

    // Only gsc.* metrics are measurable for now.
    const metricKey = hypothesis?.metric?.startsWith('gsc.')
      ? (hypothesis.metric.slice(4) as MetricKey)
      : null;

    if (!hypothesis || !metricKey || !['clicks', 'impressions', 'ctr', 'position'].includes(metricKey)) {
      await this.record(actionId, windowDays, {
        verdict: 'inconclusive',
        confidence: 0,
        delta: {},
        confounders: ['metric_not_measurable_yet'],
        baseline: {},
        observed: {},
      });
      return { verdict: 'inconclusive' };
    }

    const baselineStart = addDays(executedAt, -windowDays);
    const observedEnd = addDays(executedAt, windowDays);

    const [scopeBase, scopeObs, siteBase, siteObs] = [
      await this.scopeDaily(projectId, hypothesis, baselineStart, executedAt),
      await this.scopeDaily(projectId, hypothesis, executedAt, observedEnd),
      await this.siteDaily(projectId, baselineStart, executedAt),
      await this.siteDaily(projectId, executedAt, observedEnd),
    ];

    const result = computeVerdict({
      metricKey,
      direction: hypothesis.direction,
      baseline: scopeBase,
      observed: scopeObs,
      siteBaseline: siteBase,
      siteObserved: siteObs,
    });

    await this.record(actionId, windowDays, {
      verdict: result.verdict,
      confidence: result.confidence,
      delta: result.delta,
      confounders: result.confounders,
      baseline: { days: scopeBase.length, value: aggregate(scopeBase, metricKey) },
      observed: { days: scopeObs.length, value: aggregate(scopeObs, metricKey) },
    });

    this.logger.log(
      `Action ${actionId} evaluated: ${result.verdict} (adjusted ${result.delta.adjustedChange}, confidence ${result.confidence})`,
    );
    return { verdict: result.verdict };
  }

  /** Daily aggregates for the hypothesis scope (page → all its queries). */
  private async scopeDaily(
    projectId: string,
    hypothesis: Hypothesis,
    from: Date,
    to: Date,
  ): Promise<DailyMetrics[]> {
    const dateFilter = and(
      eq(metricSnapshots.projectId, projectId),
      eq(metricSnapshots.source, 'gsc'),
      gte(metricSnapshots.date, dateStr(from)),
      lte(metricSnapshots.date, dateStr(to)),
    );

    const scopeFilter =
      hypothesis.scope === 'page'
        ? and(
            eq(metricSnapshots.scope, 'page_keyword'),
            like(metricSnapshots.scopeRef, `${hypothesis.scopeRef}::%`),
          )
        : hypothesis.scope === 'site'
          ? and(eq(metricSnapshots.scope, 'site'), eq(metricSnapshots.scopeRef, 'site'))
          : or(
              and(eq(metricSnapshots.scope, 'page_keyword'), like(metricSnapshots.scopeRef, `%::${hypothesis.scopeRef}`)),
              and(eq(metricSnapshots.scope, 'keyword'), eq(metricSnapshots.scopeRef, hypothesis.scopeRef)),
            );

    const rows = await this.db.select().from(metricSnapshots).where(and(dateFilter, scopeFilter));
    return groupByDate(rows.map((r) => ({ date: r.date, ...(r.metrics as Record<string, number>) })));
  }

  private async siteDaily(projectId: string, from: Date, to: Date): Promise<DailyMetrics[]> {
    const rows = await this.db
      .select()
      .from(metricSnapshots)
      .where(
        and(
          eq(metricSnapshots.projectId, projectId),
          eq(metricSnapshots.source, 'gsc'),
          eq(metricSnapshots.scope, 'site'),
          gte(metricSnapshots.date, dateStr(from)),
          lte(metricSnapshots.date, dateStr(to)),
        ),
      );
    return rows.map((r) => ({ date: r.date, ...(r.metrics as Record<string, number>) }) as DailyMetrics);
  }

  private async record(
    actionId: string,
    windowDays: number,
    data: {
      verdict: string;
      confidence: number;
      delta: Record<string, unknown>;
      confounders: unknown[];
      baseline: Record<string, unknown>;
      observed: Record<string, unknown>;
    },
  ): Promise<void> {
    await this.db.insert(evaluations).values({
      actionId,
      windowDays,
      baseline: data.baseline,
      observed: data.observed,
      delta: data.delta,
      verdict: data.verdict as never,
      confidence: data.confidence,
      confounders: data.confounders,
    });
    await this.db.update(actions).set({ status: 'evaluated', updatedAt: new Date() }).where(eq(actions.id, actionId));
  }
}

/** Sum page_keyword rows into per-date aggregates (position weighted by impressions). */
function groupByDate(rows: Array<{ date: string } & Record<string, number | string>>): DailyMetrics[] {
  const byDate = new Map<string, { clicks: number; impressions: number; posWeighted: number }>();
  for (const row of rows) {
    const agg = byDate.get(row.date as string) ?? { clicks: 0, impressions: 0, posWeighted: 0 };
    const clicks = Number(row.clicks ?? 0);
    const impressions = Number(row.impressions ?? 0);
    agg.clicks += clicks;
    agg.impressions += impressions;
    agg.posWeighted += Number(row.position ?? 0) * impressions;
    byDate.set(row.date as string, agg);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, a]) => ({
      date,
      clicks: a.clicks,
      impressions: a.impressions,
      ctr: a.impressions > 0 ? a.clicks / a.impressions : 0,
      position: a.impressions > 0 ? a.posWeighted / a.impressions : 0,
    }));
}

function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setUTCDate(c.getUTCDate() + n);
  return c;
}
function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}
