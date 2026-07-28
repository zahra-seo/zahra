import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { actions, and, cycles, eq, findings, inArray, type Db } from '@zahra-seo/db';
import { scoreAction } from '@zahra-seo/core';
import type { ActionKind, Severity } from '@zahra-seo/shared';
import { DB } from '../db.module';
import { QUEUES, type PlanJobData } from '../queues';

/**
 * Planner v0 — deterministic rules, no LLM (that's phase 2, behind the same
 * job). Maps open findings to proposed actions, deduplicates against the
 * existing backlog, scores with the deterministic scorer from @zahra-seo/core.
 * Autonomy is level 0/1 in phase 1: everything stops at "proposed".
 */
@Processor(QUEUES.plan)
export class PlanProcessor extends WorkerHost {
  private readonly logger = new Logger(PlanProcessor.name);

  constructor(@Inject(DB) private readonly db: Db) {
    super();
  }

  async process(job: Job<PlanJobData>): Promise<{ proposed: number }> {
    const { projectId, cycleId } = job.data;

    const open = await this.db
      .select()
      .from(findings)
      .where(and(eq(findings.projectId, projectId), eq(findings.status, 'open')));

    // Findings already covered by a live action must not spawn duplicates.
    const liveActions = await this.db
      .select({ findingIds: actions.findingIds })
      .from(actions)
      .where(
        and(
          eq(actions.projectId, projectId),
          inArray(actions.status, ['proposed', 'approved', 'queued', 'executing', 'measuring']),
        ),
      );
    const coveredFindingIds = new Set(liveActions.flatMap((a) => (a.findingIds as string[]) ?? []));

    let proposed = 0;
    for (const finding of open) {
      if (coveredFindingIds.has(finding.id)) continue;
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

    await this.db
      .update(cycles)
      .set({
        finishedAt: new Date(),
        plannerOutput: { openFindings: open.length, proposedActions: proposed, planner: 'rules-v0' },
      })
      .where(eq(cycles.id, cycleId));

    this.logger.log(`Plan done for cycle ${cycleId}: ${proposed} action(s) proposed`);
    return { proposed };
  }
}

interface Rule {
  action: ActionKind;
  title: (entityRef: string) => string;
  rationale: (evidence: Record<string, unknown>, entityRef: string) => string;
  hypothesis: (entityRef: string) => Record<string, unknown>;
  estimate: (severity: Severity) => { impact: number; confidence: number; effort: number };
}

const severityImpact: Record<Severity, number> = { low: 0.3, medium: 0.5, high: 0.7, critical: 0.9 };

const RULES: Record<string, Rule> = {
  missing_meta: {
    action: 'fix_meta_tags',
    title: (ref) => `Compléter les meta tags de ${shortUrl(ref)}`,
    rationale: (ev) =>
      `Balises manquantes détectées au crawl : ${((ev.missing as string[]) ?? []).join(', ')}. ` +
      `Un title et une meta description corrects améliorent le CTR en SERP.`,
    hypothesis: (ref) => ({
      metric: 'gsc.ctr',
      scope: 'page',
      scopeRef: ref,
      direction: 'increase',
      windowDays: 14,
    }),
    estimate: (sev) => ({ impact: severityImpact[sev], confidence: 0.8, effort: 0.2 }),
  },
  duplicate_meta: {
    action: 'fix_meta_tags',
    title: (ref) => `Dédupliquer les meta tags de ${shortUrl(ref)}`,
    rationale: (ev) =>
      `${String(ev.field)} identique à ${((ev.duplicatedOn as string[]) ?? []).length} autre(s) page(s). ` +
      `Les balises dupliquées diluent la pertinence perçue de chaque page.`,
    hypothesis: (ref) => ({
      metric: 'gsc.ctr',
      scope: 'page',
      scopeRef: ref,
      direction: 'increase',
      windowDays: 14,
    }),
    estimate: (sev) => ({ impact: severityImpact[sev], confidence: 0.7, effort: 0.25 }),
  },
  thin_content: {
    action: 'update_content',
    title: (ref) => `Renforcer le contenu de ${shortUrl(ref)}`,
    rationale: (ev) =>
      `Contenu maigre (${String(ev.wordCount)} mots). Les pages trop courtes peinent à se positionner ` +
      `et diluent la qualité perçue du site.`,
    hypothesis: (ref) => ({
      metric: 'gsc.position',
      scope: 'page',
      scopeRef: ref,
      direction: 'increase',
      windowDays: 28,
    }),
    estimate: (sev) => ({ impact: severityImpact[sev], confidence: 0.5, effort: 0.6 }),
  },
  broken_link: {
    action: 'redirect_fix',
    title: (ref) => `Corriger le lien cassé vers ${shortUrl(ref)}`,
    rationale: (ev) =>
      `URL en erreur ${String(ev.statusCode)}, liée depuis ${String(ev.linkedFrom)}. ` +
      `Les liens cassés gaspillent le budget de crawl et dégradent l'expérience.`,
    hypothesis: (ref) => ({
      metric: 'crawl.broken_links',
      scope: 'site',
      scopeRef: ref,
      direction: 'decrease',
      windowDays: 14,
    }),
    estimate: (sev) => ({ impact: severityImpact[sev], confidence: 0.9, effort: 0.2 }),
  },
};

function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname === '/' ? u.hostname : u.pathname;
  } catch {
    return url;
  }
}
