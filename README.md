# Zahra

**An open-source autonomous SEO engineer.**

Zahra observes your site's real data (Search Console, Analytics, crawls), decides what to do next, proposes auditable changes as pull requests, measures what actually moved the needle — and learns from it.

> ⚠️ **Early days.** Zahra is under active development (phase 1 of 5). The architecture is stable, the loop is being built in the open. Star the repo and watch it grow.

## Why Zahra?

Classic SEO tools observe and recommend, but never act. "AI SEO" tools act (mass content) without ever measuring or learning. Zahra is built around the missing piece: the **closed feedback loop**.

```
 OBSERVE ──▶ PLAN ──▶ ACT ──▶ MEASURE
    ▲          │        ▲         │
    │          │   [approval      │
    │          │      gate]       │
    │          ▼                  ▼
    └──────── LEARN ◀─────────────┘
```

- **Human-in-the-loop by default.** Every mutating action goes through an approval queue. Autonomy is earned per action type, never assumed.
- **Auditable by design.** The preferred execution channel is a GitHub pull request: diffable, reviewable, revertable.
- **Every action is measured.** No action ships without a hypothesis and a measurement window. Verdicts are honest — `inconclusive` is a valid answer.
- **Learning you can read.** No fine-tuning: Zahra's memory is a table of structured learnings with confidence and evidence, injected back into planning.
- **Generic by construction.** Multi-project from day one, adapters for any stack (repo-based sites via PRs, dynamic sites via the `@zahra-seo/sdk` integration API).
- **Self-hosted first.** Your keys, your data, `docker compose up`.

## Architecture

Monorepo (pnpm + Turborepo):

```
apps/
  api/        NestJS + Fastify — REST API
  worker/     NestJS + BullMQ — cycles, crawls, executions, evaluations
packages/
  shared/     Enums & zod schemas shared end-to-end
  core/       Domain: SeoTool contract, registry, deterministic scorer
  db/         Drizzle ORM schema (PostgreSQL) — the data model is the contract
docs/
  architecture.fr.md   Full founding spec (French — English translation planned)
  adr/                 Architecture Decision Records
```

## Getting started (development)

Requirements: Node ≥ 22, pnpm ≥ 9, Docker.

```bash
pnpm install
docker compose up -d          # PostgreSQL + Redis
cp .env.example .env
pnpm db:generate && pnpm db:migrate
pnpm dev                      # api on :3000, worker attached to the queues
```

Smoke test: `curl http://localhost:3000/api/health`

## Roadmap

| Phase | Goal | Status |
|---|---|---|
| 1 — Foundations | Monorepo, full DB schema, queues, crawler, rule-based planner | 🚧 in progress |
| 2 — Intelligence & execution | Claude planner, tools (meta, schema.org, content), GitHub PR + site API channels, approval gate | ⏳ |
| 3 — Real data | Search Console + GA4 connectors, evaluator, data-driven prioritization | ⏳ |
| 4 — Memory & learning | Learnings store, scoring modifiers, experiments, autonomy suggestions | ⏳ |
| 5 — Interface | Next.js dashboard, guided onboarding, battle-tested multi-project | ⏳ |

The full spec (data model, agent loop, tool contract, guardrails) lives in [`docs/architecture.fr.md`](docs/architecture.fr.md).

## Contributing

The most natural entry point is the **tool catalogue**: implement the `SeoTool` contract (`packages/core`) for a new action type. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[AGPL-3.0](LICENSE) — free to self-host, forever; if you run a modified Zahra as a service, share your changes back.
