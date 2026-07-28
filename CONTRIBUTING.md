# Contributing to Zahra

Thanks for your interest! Zahra is young — the best way to help right now:

1. **Try it** and open issues with reproduction steps.
2. **Implement a tool**: the `SeoTool` contract in `packages/core/src/tool.ts` is the official extension point. Every tool must implement `dryRun` (mandatory preview), `execute` (idempotent by action id), `verify`, and ideally `rollback`.
3. **Improve the crawler** (`apps/worker/src/processors/crawl.processor.ts`).

## Ground rules

- TypeScript strict mode, no `any` without a comment explaining why.
- Every mutating behavior must be previewable (dry-run) and budget-aware.
- The planner may be probabilistic; scoring and guardrails stay deterministic and testable.
- Migrations via drizzle-kit only — never hand-edit the database.
- Conventional Commits (`feat:`, `fix:`, `docs:`…).

## Dev setup

See "Getting started" in the README. PRs target `main`, CI must be green.

## Architecture decisions

Significant choices are recorded in `docs/adr/`. Propose a new ADR in your PR if your change is structural.
