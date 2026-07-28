# Zahra — API Reference

Base URL: `http://localhost:3000/api` (self-hosted default).
Interactive docs: **`/api/docs`** (Swagger UI, generated from the code — always current).
No authentication in phase 1 (single-operator self-hosted); auth lands with the web UI (phase 5).

## Concepts in 30 seconds

A **project** is a tracked site. Each cycle (cron or manual), the agent **observes** (crawl; GSC/GA4 in phase 3), derives **findings** (problems & opportunities with stable fingerprints), then the planner turns them into **actions** — each with a rationale, a measurable hypothesis, and a deterministic score. In phase 1 everything stops at `proposed`: nothing mutates a site yet.

## Endpoints

### Health

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness check |

### Projects

| Method | Path | Description |
|---|---|---|
| GET | `/projects` | List tracked projects |
| POST | `/projects` | Register a site |
| GET | `/projects/{id}` | Get one project |
| POST | `/projects/{id}/cycles` | Trigger one agent cycle now |

**POST /projects** body:

```json
{ "name": "Facturaal", "baseUrl": "https://facturaal.com" }
```

Defaults applied: `status=active`, `cycle_cron="0 4 * * *"` (daily 04:00 UTC), budgets `{ maxMutatingActionsPerDay: 3, maxArticlesPerWeek: 2, maxCrawlPagesPerCycle: 200, maxTokensPerCycle: 200000 }`. The worker registers the cron schedule at boot; restart it (or wait for the next boot) after adding a project, or trigger cycles manually.

**POST /projects/{id}/cycles** → `{ "enqueued": true, "jobId": "…" }`. The cycle runs in the worker; results land in findings/actions typically within a minute (depends on site size and crawl budget).

### Findings

| Method | Path | Description |
|---|---|---|
| GET | `/projects/{projectId}/findings?status=open` | List findings (max 500, newest first) |

Statuses: `open` (detected, not handled) → `planned` (an action covers it) → `resolved` (no longer reproduces, auto-resolved by the next crawl) / `ignored`.

Kinds produced by the crawler today: `missing_meta`, `duplicate_meta`, `thin_content` (< 150 words), `broken_link`, `multiple_h1`. Each finding carries `severity` (`low`–`critical`), an `evidence` object (e.g. which tags are missing, who links to the broken URL) and a `fingerprint` (`kind:entity`) that keeps re-crawls idempotent.

### Actions

| Method | Path | Description |
|---|---|---|
| GET | `/projects/{projectId}/actions?status=proposed` | The backlog, best score first (max 500) |

An action looks like:

```json
{
  "kind": "fix_meta_tags",
  "title": "Compléter les meta tags de /pricing",
  "rationale": "Balises manquantes détectées au crawl : meta_description. …",
  "hypothesis": { "metric": "gsc.ctr", "scope": "page", "scopeRef": "…", "direction": "increase", "windowDays": 14 },
  "status": "proposed",
  "source": "rule",
  "score": 1.82,
  "estimate": { "impact": 0.5, "confidence": 0.8, "effort": 0.2 },
  "findingIds": ["…"]
}
```

`score = (impact × confidence) / effort`, adjusted by finding age (and, from phase 4, by the agent's memory). Lifecycle: `proposed → approved | rejected → queued → executing → executed → measuring → evaluated (success | neutral | regression | inconclusive) | failed | rolled_back`. Approval endpoints arrive with phase 2 (approval gate).

## Quick tour (curl)

```bash
# register a site
curl -X POST localhost:3000/api/projects -H 'content-type: application/json' \
  -d '{"name":"Facturaal","baseUrl":"https://facturaal.com"}'

# trigger a cycle, then inspect
curl -X POST localhost:3000/api/projects/<id>/cycles
curl "localhost:3000/api/projects/<id>/findings?status=open" | jq '.[].kind'
curl "localhost:3000/api/projects/<id>/actions?status=proposed" | jq '.[0]'
```

## Versioning & stability

Phase 1: the API is **unstable by design** — shapes may change until the approval gate (phase 2) ships. Breaking changes are listed in release notes from the first tagged release onward. The OpenAPI document at `/api/docs-json` is the machine-readable contract.
