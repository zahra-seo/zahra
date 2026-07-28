import { and, desc, eq, inArray, pages, findings, actions, type Db } from '@zahra-seo/db';

/**
 * Digest Builder — the compact project state the planner reasons over.
 * A few KB of curated signal, never raw dumps (§5.2 of the spec).
 */

export interface DigestFinding {
  id: string;
  kind: string;
  severity: string;
  entityRef: string;
  ageDays: number;
  evidence: Record<string, unknown>;
  /** Current page state, so the planner can DRAFT (not guess) replacements. */
  page?: { title: string | null; metaDescription: string | null; wordCount?: number };
}

export interface ProjectDigest {
  baseUrl: string;
  editorial: Record<string, unknown>;
  openFindings: DigestFinding[];
  totalOpenFindings: number;
  backlog: { proposed: number; queued: number; executedToday: number };
}

const MAX_FINDINGS_IN_DIGEST = 40;
const severityRank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export async function buildDigest(
  db: Db,
  project: { id: string; baseUrl: string; editorial: unknown },
  uncoveredFindingIds: Set<string> | null,
): Promise<ProjectDigest> {
  const open = await db
    .select()
    .from(findings)
    .where(and(eq(findings.projectId, project.id), eq(findings.status, 'open')))
    .orderBy(desc(findings.detectedAt))
    .limit(300);

  const candidates = uncoveredFindingIds ? open.filter((f) => uncoveredFindingIds.has(f.id)) : open;
  candidates.sort((a, b) => (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9));
  const selected = candidates.slice(0, MAX_FINDINGS_IN_DIGEST);

  // Enrich page-scoped findings with current page state
  const pageRefs = [...new Set(selected.filter((f) => f.entityType === 'page').map((f) => f.entityRef))];
  const pageRows = pageRefs.length
    ? await db
        .select()
        .from(pages)
        .where(and(eq(pages.projectId, project.id), inArray(pages.url, pageRefs)))
    : [];
  const pageByUrl = new Map(pageRows.map((p) => [p.url, p]));

  const backlogRows = await db
    .select({ status: actions.status })
    .from(actions)
    .where(and(eq(actions.projectId, project.id), inArray(actions.status, ['proposed', 'queued', 'executing'])));

  return {
    baseUrl: project.baseUrl,
    editorial: (project.editorial as Record<string, unknown>) ?? {},
    totalOpenFindings: candidates.length,
    openFindings: selected.map((f) => {
      const page = pageByUrl.get(f.entityRef);
      return {
        id: f.id,
        kind: f.kind,
        severity: f.severity,
        entityRef: f.entityRef,
        ageDays: Math.floor((Date.now() - f.detectedAt.getTime()) / 86_400_000),
        evidence: (f.evidence as Record<string, unknown>) ?? {},
        ...(page ? { page: { title: page.title, metaDescription: page.metaDescription } } : {}),
      };
    }),
    backlog: {
      proposed: backlogRows.filter((b) => b.status === 'proposed').length,
      queued: backlogRows.filter((b) => b.status === 'queued' || b.status === 'executing').length,
      executedToday: 0, // refined in phase 3 with real execution history
    },
  };
}
