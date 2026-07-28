# ADR 0001 — NestJS/TypeScript over Go

- **Status**: accepted (2026-07-28)
- **Context**: Zahra is an I/O-bound orchestrator: it spends its time waiting on external APIs (LLM, GitHub, Google APIs, Postgres). The runtime is never the bottleneck.
- **Decision**: TypeScript everywhere — NestJS (Fastify) for api/worker, one language across agent, SDK and future web UI.
- **Rationale**:
  - Ecosystem fit: Lighthouse and Playwright are Node-native; BullMQ is the standard NestJS queue; the Anthropic SDK is first-class in TS.
  - The site-side SDK (`@zahra-seo/sdk`) targets JS frameworks (Next.js, Astro, Nuxt) — one language means zod schemas shared end-to-end, no codegen.
  - Target contributors are web developers, overwhelmingly TypeScript.
  - NestJS DI fits the adapter architecture (tools, connectors, channels).
- **Trade-offs accepted**: higher memory footprint than Go; no single static binary (mitigated by Docker Compose distribution).
- **Escape hatch**: if crawling ever becomes a real performance problem (100k+ page sites), extract the crawler as a separate Go service behind the collector interface. Nothing in the architecture prevents it.
