# GitHub PR channel — site integration

Zahra's preferred execution channel is the **pull request**: auditable, reviewable, revertable. This document explains how a site repo integrates it, starting with the `fix_meta_tags` tool.

## The meta-overrides convention

Zahra never guesses where meta tags live in your code. Instead, it patches **one conventional file** in your repo:

```
zahra/meta-overrides.json
```

```json
{
  "/": { "title": "Facturaal — Facturation simple pour PME" },
  "/pricing": {
    "title": "Tarifs — Facturaal",
    "metaDescription": "Des tarifs simples et transparents, pensés pour les PME sénégalaises."
  }
}
```

Keys are **pathnames**, values are the overrides. Your site reads this file at render time and lets it take precedence over hardcoded values.

### Next.js (App Router)

```ts
// lib/zahra-meta.ts
import overrides from '@/zahra/meta-overrides.json';

export function zahraMeta(pathname: string) {
  return (overrides as Record<string, { title?: string; metaDescription?: string }>)[pathname] ?? {};
}
```

```ts
// app/pricing/page.tsx
import { zahraMeta } from '@/lib/zahra-meta';

export function generateMetadata() {
  const zahra = zahraMeta('/pricing');
  return {
    title: zahra.title ?? 'Tarifs — Facturaal',
    description: zahra.metaDescription ?? 'Description par défaut…',
  };
}
```

Astro, Nuxt and plain SSR follow the same pattern: import the JSON, spread the override. ~10 lines, once.

## Setup

1. **Token**: create a fine-grained PAT scoped to the site repo with `Contents: write` and `Pull requests: write`. Put it in the worker's env as `GITHUB_TOKEN`. (GitHub App support is planned; encrypted per-project credentials land with the integrations work in phase 3.)
2. **Project config**: set the repo on the project:

```bash
curl -X PATCH localhost:3000/api/projects/<id> -H 'content-type: application/json' \
  -d '{"repoOwner":"my-org","repoName":"my-site","adapter":"github_pr"}'
```

3. **Site integration**: add the ~10-line snippet above to your site (a PR you write once).

## What an execution looks like

1. The planner proposes a `fix_meta_tags` action (from a `missing_meta`/`duplicate_meta` finding).
2. You approve it — `POST /projects/{id}/actions/{actionId}/approve` — providing the values in `editedInput` while the rule-based planner can't draft them (the Claude planner takes over drafting in phase 2):

```json
{
  "editedInput": {
    "url": "https://facturaal.com/pricing",
    "overrides": { "metaDescription": "Des tarifs simples et transparents, pensés pour les PME sénégalaises." }
  }
}
```

3. The worker dry-runs (diff recorded in `action_runs`), creates branch `zahra/action-<id>`, patches `zahra/meta-overrides.json`, opens a PR titled `[Zahra] Meta tags — /pricing` with the rationale in the body, and verifies the PR exists.
4. **Merging the PR is the final human gate.** Once deployed, the measurement window opens (phase 3: the evaluator compares GSC CTR before/after).

Failed verifications mark the action `failed`; a rollback closes the PR. The daily mutating-actions budget (`budgets.maxMutatingActionsPerDay`, default 3) is enforced in the worker, outside any LLM.
