import { z } from 'zod';
import { GitHubClient, type GitHubRepoRef } from '@zahra-seo/connectors';
import type { DryRunReport, ProjectContext, SeoTool, VerifyResult } from '@zahra-seo/core';

/**
 * First mutating tool — meta tags via the "meta-overrides" convention.
 *
 * The site keeps a `zahra/meta-overrides.json` file in its repo mapping
 * pathname → { title, metaDescription }, consumed at render time
 * (see docs/integration-github.md for the Next.js snippet). Zahra never
 * guesses where meta tags live in your code: it patches this one file,
 * through a reviewable pull request.
 */

export const fixMetaTagsInputSchema = z.object({
  url: z.string().url(),
  overrides: z
    .object({
      title: z.string().min(5).max(70).optional(),
      metaDescription: z.string().min(30).max(170).optional(),
    })
    .refine((o) => o.title || o.metaDescription, 'At least one of title/metaDescription is required'),
});
export type FixMetaTagsInput = z.infer<typeof fixMetaTagsInputSchema>;

export interface FixMetaTagsArtifact {
  prNumber: number;
  prUrl: string;
  branch: string;
  commitSha: string;
}

const OVERRIDES_PATH = 'zahra/meta-overrides.json';

export class FixMetaTagsTool implements SeoTool<FixMetaTagsInput, FixMetaTagsArtifact> {
  readonly kind = 'fix_meta_tags' as const;
  readonly mutating = true;
  readonly channels = ['github_pr' as const];
  readonly inputSchema = fixMetaTagsInputSchema;

  constructor(private readonly github: GitHubClient) {}

  private repoRef(ctx: ProjectContext): GitHubRepoRef {
    const { repoOwner, repoName } = ctx.channelConfig as { repoOwner?: string; repoName?: string };
    if (!repoOwner || !repoName) {
      throw new Error('Project has no repoOwner/repoName configured — required by the github_pr channel');
    }
    return { owner: repoOwner, repo: repoName };
  }

  private async patchedOverrides(ctx: ProjectContext, input: FixMetaTagsInput, branch: string) {
    const ref = this.repoRef(ctx);
    const existing = await this.github.getFile(ref, OVERRIDES_PATH, branch);
    const current: Record<string, { title?: string; metaDescription?: string }> = existing
      ? JSON.parse(existing.content)
      : {};
    const pathname = new URL(input.url).pathname;
    const before = JSON.stringify(current, null, 2);
    current[pathname] = { ...current[pathname], ...input.overrides };
    const after = JSON.stringify(sortKeys(current), null, 2) + '\n';
    return { ref, existing, before, after, pathname };
  }

  async dryRun(ctx: ProjectContext, input: FixMetaTagsInput): Promise<DryRunReport> {
    const base = await this.github.getDefaultBranch(this.repoRef(ctx));
    const { existing, before, after, pathname } = await this.patchedOverrides(ctx, input, base);
    return {
      summary:
        `Patch ${OVERRIDES_PATH}: set ${Object.keys(input.overrides).join(' + ')} for "${pathname}". ` +
        (existing ? 'File exists, entry will be merged.' : 'File will be created.'),
      diffs: [{ path: OVERRIDES_PATH, before: existing ? before : null, after }],
    };
  }

  async execute(ctx: ProjectContext, input: FixMetaTagsInput, actionId: string): Promise<FixMetaTagsArtifact> {
    const ref = this.repoRef(ctx);
    const base = await this.github.getDefaultBranch(ref);
    const branch = `zahra/action-${actionId.slice(0, 8)}`;

    const baseSha = await this.github.getBranchSha(ref, base);
    await this.github.createBranch(ref, branch, baseSha).catch((err) => {
      // Branch already there (idempotent retry) — fine, we commit onto it.
      if (!String(err).includes('422')) throw err;
    });

    const { existing, after, pathname } = await this.patchedOverrides(ctx, input, base);
    const { commitSha } = await this.github.putFile(
      ref,
      OVERRIDES_PATH,
      branch,
      after,
      `seo: update meta tags for ${pathname} (zahra action ${actionId.slice(0, 8)})`,
      existing?.sha,
    );

    const pr = await this.github.openPullRequest(ref, {
      title: `[Zahra] Meta tags — ${pathname}`,
      body:
        `Proposed by Zahra (action \`${actionId}\`).\n\n` +
        `| Field | New value |\n|---|---|\n` +
        Object.entries(input.overrides)
          .map(([k, v]) => `| ${k} | ${String(v)} |`)
          .join('\n') +
        `\n\nMerging this PR **is** the approval of the change reaching production. ` +
        `The measurement window starts when Zahra verifies the deploy.`,
      head: branch,
      base,
    });

    return { prNumber: pr.number, prUrl: pr.url, branch, commitSha };
  }

  async verify(ctx: ProjectContext, artifact: FixMetaTagsArtifact): Promise<VerifyResult> {
    const pr = await this.github.getPullRequest(this.repoRef(ctx), artifact.prNumber);
    return {
      ok: pr.state === 'open' || pr.merged,
      details: `PR #${pr.number} is ${pr.merged ? 'merged' : pr.state}: ${artifact.prUrl}`,
    };
  }

  async rollback(ctx: ProjectContext, artifact: FixMetaTagsArtifact): Promise<void> {
    await this.github.closePullRequest(this.repoRef(ctx), artifact.prNumber);
  }
}

function sortKeys<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b))) as T;
}
