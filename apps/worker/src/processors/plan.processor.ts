import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, Optional } from '@nestjs/common';
import { Job } from 'bullmq';
import { actions, and, cycles, eq, findings, inArray, projects, type Db } from '@zahra-seo/db';
import { scoreAction, type LlmProvider } from '@zahra-seo/core';
import type { Severity } from '@zahra-seo/shared';
import { DB } from '../db.module';
import { LLM } from '../llm.module';
import { QUEUES, type PlanJobData } from '../queues';
import { buildDigest } from '../planner/digest';
import { planWithClaude } from '../planner/claude-planner';
import { RULES } from '../planner/rules-planner';

/**
 * PLAN step. Claude planner when a provider is configured (drafts real values),
 * deterministic rules otherwise — and as automatic fallback on any LLM failure.
 * In both paths the deterministic scorer owns the final priority.
 */
@Processor(QUEUES.plan)
export class PlanProcessor extends WorkerHost {
  private readonly logger = new Logger(PlanProcessor.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Optional() @Inject(LLM) private readonly llm: LlmProvider | null,
  ) {
    super();
  }

  async process(job: Job<PlanJobData>): Promise<{ proposed: number; planner: string }> {
    const { projectId, cycleId } = job.data;

    const open = await this.db
      .select()
      .from(findings)
      .where(and(eq(findings.projectId, projectId), eq(findings.status, 'open')));

    const liveActions = await this.db
      .select({ findingIds: actions.findingIds })
      .from(actions)
      .where(
        and(
          eq(actions.projectId, projectId),
          inArray(actions.status, ['proposed', 'approved', 'queued', 'executing', 'measuring']),
        ),
      );
    const covered = new Set(liveActions.flatMap((a) => (a.findingIds as string[]) ?? []));
    const uncovered = open.filter((f) => !covered.has(f.id));

    if (uncovered.length === 0) {
      await this.finishCycle(cycleId, { openFindings: open.length, proposedActions: 0, planner: 'noop' });
      return { proposed: 0, planner: 'noop' };
    }

    if (this.llm) {
      try {
        const result = await this.planClaude(projectId, cycleId, uncovered);
        return { proposed: result, planner: 'claude' };
      } catch (err) {
        this.logger.error(`Claude planner failed, falling back to rules: ${err instanceof Error ? err.message : err}`);
      }
    }

    const proposed = await this.planRules(projectId, cycleId, uncovered);
    return { proposed, planner: 'rules' };
  }

  // --- Claude path -----------------------------------------------------------

  private async planClaude(
    projectId: string,
    cycleId: string,
    uncovered: (typeof findings.$inferSelect)[],
  ): Promise<number> {
    const [projectRow] = await this.db.select().from(projects).where(eq(projects.id, projectId));
    const digest = await buildDigest(this.db, projectRow, new Set(uncovered.map((f) => f.id)));

    const plan = await planWithClaude(this.llm!, digest);
    const findingById = new Map(uncovered.map((f) => [f.id, f]));

    let proposed = 0;
    for (const planned of plan.actions) {
      const finding = findingById.get(planned.findingId);
      if (!finding) continue; // hallucinated finding id — drop silently

      const ageDays = (Date.now() - finding.detectedAt.getTime()) / 86_400_000;
      const score = scoreAction({ ...planned.estimate, findingAgeDays: ageDays });

      await this.db.insert(actions).values({
        projectId,
        kind: planned.kind,
        title: planned.title,
        rationale: planned.rationale,
        hypothesis: planned.hypothesis,
        input: planned.input,
        status: 'proposed',
        source: 'planner',
        score,
        estimate: planned.estimate,
        findingIds: [finding.id],
        createdByCycleId: cycleId,
      });
      await this.db.update(findings).set({ status: 'planned' }).where(eq(findings.id, finding.id));
      proposed += 1;
    }

    // Sonnet pricing ($3/M in, $15/M out) — rough, for budget visibility only.
    const costCents = Math.round((plan.usage.inputTokens * 300 + plan.usage.outputTokens * 1500) / 1_000_000);
    await this.db
      .update(cycles)
      .set({
        finishedAt: new Date(),
        tokensUsed: plan.usage.inputTokens + plan.usage.outputTokens,
        costEstimateCents: costCents,
        plannerOutput: {
          planner: 'claude',
          model: plan.model,
          proposedActions: proposed,
          invalidInputsSkipped: plan.skipped,
          digestFindings: digest.openFindings.length,
        },
      })
      .where(eq(cycles.id, cycleId));

    this.logger.log(
      `Claude plan: ${proposed} action(s), ${plan.usage.inputTokens}+${plan.usage.outputTokens} tokens (~${costCents}¢)`,
    );
    return proposed;
  }

  // --- Rules path ------------------------------------------------------------

  private async planRules(
    projectId: string,
    cycleId: string,
    uncovered: (typeof findings.$inferSelect)[],
  ): Promise<number> {
    let proposed = 0;
    for (const finding of uncovered) {
      const rule = RULES[finding.kind];
      if (!rule) continue;

      const ageDays = (Date.now() - finding.detectedAt.getTime()) / 86_400_000;
      const estimate = rule.estimate(finding.severity as Severity);
      const score = scoreAction({ ...estimate, findingAgeDays: ageDays });

      await this.db.insert(actions).values({
        projectId,
        kind: rule.action,
        title: rule.title(finding.entityRef),
        rationale: rule.rationale(finding.evidence as Record<string, unknown>, finding.entityRef),
        hypothesis: rule.hypothesis(finding.entityRef),
        input: { findingKind: finding.kind, entityRef: finding.entityRef, evidence: finding.evidence },
        status: 'proposed',
        source: 'rule',
        score,
        estimate,
        findingIds: [finding.id],
        createdByCycleId: cycleId,
      });
      await this.db.update(findings).set({ status: 'planned' }).where(eq(findings.id, finding.id));
      proposed += 1;
    }

    await this.finishCycle(cycleId, { proposedActions: proposed, planner: 'rules-v0' });
    this.logger.log(`Rules plan: ${proposed} action(s) proposed`);
    return proposed;
  }

  private async finishCycle(cycleId: string, output: Record<string, unknown>): Promise<void> {
    await this.db.update(cycles).set({ finishedAt: new Date(), plannerOutput: output }).where(eq(cycles.id, cycleId));
  }
}
