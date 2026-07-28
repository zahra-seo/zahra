import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { actionRuns, actions, and, eq, gte, inArray, projects, type Db } from '@zahra-seo/db';
import { ToolRegistry, type ProjectContext } from '@zahra-seo/core';
import { projectBudgetsSchema, type ActionKind } from '@zahra-seo/shared';
import { DB } from '../db.module';
import { QUEUES, type ExecuteJobData } from '../queues';

/**
 * ACT step — runs one approved action through its tool:
 * dry-run (recorded) → execute (idempotent by action id) → verify.
 * Hard budget: maxMutatingActionsPerDay, enforced here, outside any LLM.
 */
@Processor(QUEUES.execute)
export class ExecuteProcessor extends WorkerHost {
  private readonly logger = new Logger(ExecuteProcessor.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly registry: ToolRegistry,
  ) {
    super();
  }

  async process(job: Job<ExecuteJobData>): Promise<{ status: string }> {
    const { actionId, projectId } = job.data;

    const [action] = await this.db.select().from(actions).where(eq(actions.id, actionId));
    if (!action) throw new Error(`Action ${actionId} not found`);
    if (action.status !== 'queued') {
      this.logger.warn(`Action ${actionId} is "${action.status}", expected "queued" — skipping`);
      return { status: action.status };
    }

    const [project] = await this.db.select().from(projects).where(eq(projects.id, projectId));
    if (!project) throw new Error(`Project ${projectId} not found`);

    const tool = this.registry.get(action.kind as ActionKind);
    if (!tool) {
      await this.fail(actionId, `No tool registered for kind "${action.kind}"`);
      return { status: 'failed' };
    }

    // --- hard daily budget for mutating tools ---
    if (tool.mutating) {
      const budgets = projectBudgetsSchema.parse(project.budgets ?? {});
      const dayStart = new Date();
      dayStart.setUTCHours(0, 0, 0, 0);
      const executedToday = await this.db
        .select({ id: actions.id })
        .from(actions)
        .where(
          and(
            eq(actions.projectId, projectId),
            inArray(actions.status, ['executed', 'measuring', 'evaluated']),
            gte(actions.updatedAt, dayStart),
          ),
        );
      if (executedToday.length >= budgets.maxMutatingActionsPerDay) {
        this.logger.warn(`Daily mutating budget reached (${budgets.maxMutatingActionsPerDay}) — action stays queued`);
        throw new Error('DAILY_BUDGET_REACHED'); // BullMQ retries later (backoff configured on enqueue)
      }
    }

    const ctx: ProjectContext = {
      projectId,
      baseUrl: project.baseUrl,
      channelConfig: { repoOwner: project.repoOwner, repoName: project.repoName },
    };

    const input = tool.inputSchema.parse(action.input);
    await this.db.update(actions).set({ status: 'executing', updatedAt: new Date() }).where(eq(actions.id, actionId));

    try {
      // 1. dry-run, recorded — the audit trail of what was about to change
      const startedDry = new Date();
      const report = await tool.dryRun(ctx, input);
      await this.db.insert(actionRuns).values({
        actionId,
        executor: tool.kind,
        channel: 'github_pr',
        dryRun: true,
        artifacts: report as unknown as Record<string, unknown>,
        startedAt: startedDry,
        finishedAt: new Date(),
      });

      // 2. execute (idempotency key = action id)
      const startedExec = new Date();
      const artifact = await tool.execute(ctx, input, actionId);

      // 3. verify
      const verdict = await tool.verify(ctx, artifact);
      await this.db.insert(actionRuns).values({
        actionId,
        executor: tool.kind,
        channel: 'github_pr',
        dryRun: false,
        artifacts: { ...(artifact as Record<string, unknown>), verify: verdict },
        startedAt: startedExec,
        finishedAt: new Date(),
      });

      if (!verdict.ok) {
        await this.fail(actionId, `Verification failed: ${verdict.details ?? 'unknown'}`);
        return { status: 'failed' };
      }

      await this.db.update(actions).set({ status: 'executed', updatedAt: new Date() }).where(eq(actions.id, actionId));
      this.logger.log(`Action ${actionId} executed: ${verdict.details ?? 'ok'}`);
      return { status: 'executed' };
    } catch (err) {
      if (err instanceof Error && err.message === 'DAILY_BUDGET_REACHED') throw err;
      await this.fail(actionId, err instanceof Error ? err.message : String(err));
      return { status: 'failed' };
    }
  }

  private async fail(actionId: string, message: string): Promise<void> {
    this.logger.error(`Action ${actionId} failed: ${message}`);
    await this.db
      .insert(actionRuns)
      .values({ actionId, executor: 'unknown', dryRun: false, artifacts: {}, startedAt: new Date(), finishedAt: new Date(), error: message.slice(0, 1000) });
    await this.db.update(actions).set({ status: 'failed', updatedAt: new Date() }).where(eq(actions.id, actionId));
  }
}
