# Zahra — Agent SEO autonome open source

> **Spécification & architecture — v0.1 (draft)**
> Document fondateur du projet. Servira de base au README et à la documentation d'architecture du repo.

*Le projet s'appelle **Zahra** (de l'arabe zahrāʾ, « celle qui rayonne, qui fleurit »). Handles : organisation GitHub **`zahra-seo`** (disponible, vérifié le 28/07/2026 — à réserver rapidement) et scope npm **`@zahra-seo`**.*

---

## 1. Vision

### 1.1 Le problème

Le SEO est un travail continu, itératif et mesurable — exactement le profil de tâche qu'un agent autonome peut prendre en charge. Pourtant, aujourd'hui :

- Les outils SEO classiques (Ahrefs, Semrush, Screaming Frog) **observent et recommandent**, mais n'agissent pas.
- Les outils « AI SEO » commerciaux (génération de contenu en masse) **agissent sans mesurer**, sans boucle de feedback, et souvent sans garde-fous.
- Les projets open source existants sont des **outils ou des connecteurs** (CLI GSC, skills d'audit, wrappers d'API), pas des systèmes bouclés. Aucun projet open source de référence n'implémente le cycle complet *analyse → décision → action → mesure → apprentissage*.

Il manque un **ingénieur SEO autonome** : un système qui observe les données réelles d'un site (Search Console, Analytics, crawl), décide de la prochaine action la plus rentable, l'exécute de manière auditable, mesure l'effet réel de son action, et ajuste sa stratégie en conséquence.

### 1.2 La thèse

Un agent SEO ne vaut que par sa **boucle de feedback**. Générer 50 articles est trivial ; savoir que l'article sur le mot-clé X a gagné 12 positions en 3 semaines pendant que la refonte des meta descriptions n'a rien changé — et réallouer l'effort en conséquence — c'est ça, le travail d'un ingénieur SEO. Zahra est construit autour de cette boucle, pas autour de la génération de contenu.

### 1.3 Principes de conception

1. **Human-in-the-loop d'abord.** Toute action mutante (publier, modifier une page) passe par une file d'approbation. L'autonomie se gagne progressivement, par type d'action, à mesure que la confiance s'établit. C'est aussi le seul mode acceptable pour un projet open source destiné à des sites en production.
2. **Chaque action est mesurée.** Une action sans hypothèse de résultat ni fenêtre de mesure n'est pas exécutée. L'attribution (même imparfaite) est un citoyen de première classe du modèle de données.
3. **Auditable et réversible.** Le canal d'exécution privilégié est la Pull Request GitHub : chaque changement est diffable, reviewable, revertable. Rien n'est modifié « en douce ».
4. **Générique par construction.** Multi-projets dès le schéma de données de la phase 1. Zahra doit fonctionner pour Facturaal comme pour n'importe quel SaaS ou site de contenu, via des adapters.
5. **Self-hosted d'abord.** Un `docker compose up` doit suffire. Les clés API (Claude, Google, GitHub) appartiennent à l'utilisateur.
6. **Sobre en tokens et en quotas.** Le Planner raisonne sur des synthèses pré-calculées, pas sur des dumps bruts. Les quotas GSC/GA4 sont gérés nativement (voir §8).

### 1.4 Positionnement

| | Outils SEO classiques | AI writers / SEO bots | **Zahra** |
|---|---|---|---|
| Observe les données réelles | ✅ | ❌ (ou superficiel) | ✅ GSC + GA4 + crawl |
| Décide et priorise | ❌ (humain) | ❌ (volume aveugle) | ✅ Planner LLM + scoring |
| Exécute des actions | ❌ | ✅ (contenu seulement) | ✅ PR GitHub + API site |
| Mesure l'effet de ses actions | ❌ | ❌ | ✅ fenêtres de mesure + attribution |
| Apprend de ses résultats | ❌ | ❌ | ✅ mémoire + priorisation adaptative |
| Open source | rare | ❌ | ✅ |

---

## 2. Vue d'ensemble de l'architecture

### 2.1 La boucle agent

```
        ┌──────────────────────────────────────────────────────┐
        │                      SCHEDULER (cron)                 │
        └───────────────┬──────────────────────────────────────┘
                        ▼
   ┌────────────┐   ┌────────────┐   ┌──────────────┐   ┌────────────┐
   │  OBSERVE   │──▶│    PLAN    │──▶│     ACT      │──▶│  MEASURE   │
   │ Collectors │   │  Planner   │   │  Executors   │   │ Evaluator  │
   │ GSC · GA4  │   │  (Claude)  │   │ PR · API site│   │ snapshots  │
   │ crawl      │   │  scoring   │   │              │   │ vs baseline│
   └────────────┘   └─────┬──────┘   └──────▲───────┘   └─────┬──────┘
                          │                 │                  │
                          │          ┌──────┴───────┐          │
                          │          │ APPROVAL GATE│          │
                          │          │ (human-in-   │          │
                          │          │  the-loop)   │          │
                          │          └──────────────┘          │
                          ▼                                    ▼
                   ┌─────────────────────────────────────────────┐
                   │                 LEARN — Memory               │
                   │   learnings · experiments · action outcomes  │
                   └─────────────────────────────────────────────┘
```

Chaque **cycle** (quotidien par défaut, configurable par projet) exécute : collecte des données fraîches → synthèse de l'état du projet → planification (le Planner produit ou re-priorise un backlog d'actions) → exécution des actions approuvées dans la limite du budget → évaluation des actions dont la fenêtre de mesure est arrivée à échéance → écriture des enseignements en mémoire.

### 2.2 Composants

| Composant | Rôle | Phase |
|---|---|---|
| **Collectors** | Ingestion GSC, GA4, crawl interne (Lighthouse, liens, meta) → snapshots normalisés | 1 (crawl) · 3 (GSC/GA4) |
| **Planner** | Cœur décisionnel. Claude + contexte projet + backlog + mémoire → actions priorisées avec hypothèses | 1 (règles) · 2 (LLM) |
| **Task Queue** | BullMQ/Redis : cycles, collectes, exécutions, évaluations. Retries, idempotence, concurrence | 1 |
| **Executors (Tools)** | Implémentations d'actions derrière un contrat commun (dry-run / execute / verify / rollback) | 2 |
| **Approval Gate** | File d'approbation des actions mutantes ; politique d'autonomie par type d'action | 2 |
| **Evaluator** | Compare métriques avant/après par action, statue sur l'issue (success / neutral / regression) | 3–4 |
| **Memory** | Enseignements structurés + historique d'issues, réinjectés dans le contexte du Planner | 4 |
| **Web UI** | Dashboard Next.js : backlog, approbations, résultats, mémoire | 5 (API dès la 1) |

---

## 3. Stack technique

| Couche | Choix | Justification |
|---|---|---|
| Backend | **NestJS + Fastify** | Stack maîtrisée (même socle que Venpos/Facturaal), modulaire, DI propice aux adapters |
| File de tâches | **BullMQ + Redis** | Standard NestJS, jobs répétables (cron), retries, rate-limiting par queue |
| Base de données | **PostgreSQL** | JSONB pour payloads d'actions et snapshots ; un seul moteur pour tout, y compris les données de séries temporelles au départ |
| ORM | **Drizzle** (ou Prisma) | Migrations versionnées obligatoires pour un projet OSS ; Drizzle plus léger et SQL-first |
| LLM | **Claude API** (tool use + structured outputs) | Planner et générateurs de contenu ; interface `LlmProvider` pour rester agnostique |
| Monorepo | **Turborepo + pnpm** | `apps/api`, `apps/web`, `packages/core`, `packages/sdk`, `packages/shared` |
| Frontend | **Next.js (App Router)** | Phase 5 ; l'API REST/OpenAPI existe dès la phase 1 |
| Crawl/audit | **Playwright + Lighthouse** (Chromium) | Audit technique local sans dépendance à un service tiers |
| Déploiement | **Docker Compose** (api + worker + postgres + redis) | Self-hosted en une commande |

Séparation **api / worker** dès le départ : même codebase NestJS, deux points d'entrée (HTTP vs processeurs BullMQ), pour scaler et isoler les crashs de jobs.

---

## 4. Modèle de données

Toutes les tables portent un `project_id` (multi-projets natif). Schéma cible simplifié :

### 4.1 Référentiel

- **`projects`** — un site suivi. `id, name, base_url, repo_owner/repo_name, site_adapter (github_pr | site_api | both), autonomy_policy (jsonb), cycle_cron, budgets (jsonb : actions/jour, tokens/cycle, coût/mois), status`
- **`integrations`** — credentials chiffrés par projet. `project_id, kind (gsc | ga4 | github | site_api), config (jsonb), oauth_tokens (chiffrés), status, last_sync_at`
- **`pages`** — inventaire des URLs du site (découvertes par crawl + sitemap). `project_id, url, canonical, title, meta_description, status_code, content_hash, last_crawled_at, indexation_state`
- **`keywords`** — requêtes suivies. `project_id, query, source (gsc | seed | planner), target_page_id?, intent?, is_tracked`

### 4.2 Observation

- **`crawl_reports`** — résultat d'un crawl : `project_id, started_at, pages_count, issues (jsonb), lighthouse_scores (jsonb)`
- **`findings`** — problèmes/opportunités détectés, normalisés. `project_id, kind (missing_meta | slow_page | orphan_page | keyword_opportunity | cannibalization | broken_link | thin_content | …), severity, entity (page/keyword), evidence (jsonb), status (open | planned | resolved | ignored), detected_at, resolved_at`
- **`metric_snapshots`** — séries temporelles quotidiennes. `project_id, date, scope (site | page | keyword | page_keyword), scope_ref, source (gsc | ga4), metrics (jsonb : clicks, impressions, ctr, position, sessions, conversions)`

### 4.3 Décision & action

- **`actions`** — l'unité centrale du système. `project_id, kind (catalogue §6.3), title, rationale (pourquoi le Planner la propose), hypothesis (résultat attendu, métrique cible), input (jsonb), score (impact × confiance / effort), status, source (planner | rule | human), finding_ids[], created_by_cycle_id`
  - Cycle de vie : `proposed → approved | rejected → queued → executing → executed → measuring → evaluated (success | neutral | regression) | failed | rolled_back`
- **`approvals`** — décisions humaines. `action_id, decision (approve | reject | edit), decided_by, comment, decided_at`
- **`action_runs`** — exécutions concrètes. `action_id, executor, channel (github_pr | site_api), artifacts (jsonb : pr_url, commit_sha, api_response), dry_run_output, started_at, finished_at, error`
- **`cycles`** — journal de chaque tour de boucle. `project_id, started_at, phase_timings, planner_input_digest, planner_output (jsonb), tokens_used, cost_estimate`

### 4.4 Mesure & apprentissage

- **`evaluations`** — verdict d'une action après sa fenêtre de mesure. `action_id, window_days (14 | 28 | 90), baseline (jsonb), observed (jsonb), delta (jsonb), verdict, confidence, confounders (jsonb : autres actions sur la même page, saisonnalité, update Google suspectée)`
- **`learnings`** — mémoire de l'agent (voir §9). `project_id (nullable = global), statement, kind (tactic_outcome | site_insight | constraint), evidence_action_ids[], confidence, times_confirmed, times_contradicted, last_confirmed_at, embedding?`
- **`experiments`** — tests A/B structurés (phase 4). `project_id, hypothesis, variant_config, page_ids[], status, result`

---

## 5. La boucle agent en détail

### 5.1 Déclenchement

Un job répétable BullMQ par projet (`cycle_cron`, quotidien par défaut). Un cycle peut aussi être déclenché manuellement (UI/CLI) ou par événement (déploiement du site, gros mouvement détecté dans GSC).

### 5.2 Observe

Les collectors tournent en amont du Planner et écrivent des données **normalisées** :

1. **Crawl interne** : sitemap + suivi de liens (Playwright), extraction title/meta/canonical/hreflang/schema.org/liens internes, Lighthouse sur un échantillon de pages. Produit des `findings` techniques.
2. **GSC sync** (phase 3) : Search Analytics par jour × page × query (données disponibles avec ~2 jours de latence), état d'indexation via URL Inspection sur les pages prioritaires.
3. **GA4 sync** (phase 3) : sessions organiques, engagement, conversions par landing page.

Un **Digest Builder** compile ensuite un état synthétique du projet (quelques Ko, pas des dumps) : top mouvements de positions, findings ouverts par sévérité, actions en cours de mesure, budget restant. C'est ce digest — pas les données brutes — qui entre dans le contexte du Planner.

### 5.3 Plan

Le Planner est un appel Claude structuré (tool use / structured output) qui reçoit :

- le **digest** de l'état du projet ;
- le **backlog** actuel (actions proposées non traitées, avec leur âge) ;
- la **mémoire** pertinente (phase 4 : learnings du projet + learnings globaux) ;
- la **politique du projet** (autonomie, budgets, contraintes éditoriales, langue, ton) ;
- le **catalogue d'actions** disponibles (contrats des tools, §6).

Il produit une liste d'actions candidates, chacune avec : `kind`, `input`, `rationale`, `hypothesis` (métrique cible + direction + fenêtre), et une estimation impact/effort/confiance. Un **scorer déterministe** recalcule ensuite le score final :

```
score = (impact_estimé × confiance) / effort
      × modificateur_mémoire        // phase 4 : les tactiques qui ont marché ici montent
      × modificateur_fraîcheur      // les findings anciens jamais traités remontent doucement
```

Règles dures (hors LLM) : jamais deux actions mutantes simultanées sur la même page pendant une fenêtre de mesure (sinon l'attribution est morte) ; respect du budget d'actions/jour ; pas d'action sur une page en cours d'expérimentation.

**Phase 1 (avant Claude)** : le Planner est un moteur de règles simple (findings → actions mécaniques type « meta description manquante → proposer une meta »). Ça permet de valider toute la tuyauterie (queue, statuts, approbations) avant d'introduire le LLM en phase 2.

### 5.4 Act

Les actions approuvées (ou auto-approuvées selon la politique, §7) partent en queue d'exécution. Chaque executor suit le contrat du §6.1 : dry-run systématique conservé dans `action_runs`, puis exécution réelle, puis `verify()` (la PR est bien ouverte, l'API a bien répondu, la page rend bien la nouvelle balise).

### 5.5 Measure

À l'exécution, l'Evaluator fige une **baseline** (28 jours de métriques avant l'action, sur le scope concerné). À l'échéance de la fenêtre (14 j par défaut, 28 j pour le contenu), il compare, calcule les deltas, note les **confounders** connus (autres actions sur la même page, tendance globale du site comme proxy de saisonnalité/core update), et rend un verdict prudent : `success | neutral | regression | inconclusive`. Un verdict n'est jamais présenté comme une certitude causale — c'est un signal.

### 5.6 Learn

Chaque évaluation alimente la mémoire (§9). Le cycle suivant, le Planner voit ces enseignements et le scorer applique ses modificateurs. C'est ici que « l'agent apprend de ses propres résultats » devient concret et inspectable — la mémoire est une table lisible, pas un fine-tuning opaque.

---

## 6. Couche exécution : les Tools

### 6.1 Contrat d'interface

```ts
interface SeoTool<TInput, TArtifact> {
  kind: ActionKind;
  mutating: boolean;                    // false = lecture/analyse, true = modifie le site
  channels: Channel[];                  // 'github_pr' | 'site_api'
  inputSchema: ZodSchema<TInput>;       // validé avant toute exécution

  dryRun(ctx: ProjectContext, input: TInput): Promise<DryRunReport>;   // diff prévisualisable
  execute(ctx: ProjectContext, input: TInput): Promise<TArtifact>;     // idempotent (clé = action_id)
  verify(ctx: ProjectContext, artifact: TArtifact): Promise<VerifyResult>;
  rollback?(ctx: ProjectContext, artifact: TArtifact): Promise<void>;  // revert PR / appel API inverse
}
```

Le `DryRunReport` (diff de fichiers ou payload API prévisualisé) est ce que voit l'humain dans la file d'approbation — on approuve un **changement concret**, pas une intention.

### 6.2 Les deux canaux d'exécution

**Canal 1 — Pull Requests GitHub (canal par défaut).**
L'agent dispose d'un accès en lecture au repo du site et ouvre des PRs via l'API GitHub (branche `zahra/action-{id}`, commits signés par un compte bot, description de PR = rationale + hypothèse + lien vers l'action). Fonctionne pour tout site dont le contenu vit dans un repo : MDX/Markdown, config Next.js metadata, sitemap, fichiers JSON-LD. La review de PR **est** l'approbation pour les équipes qui préfèrent ce flux — le merge (webhook GitHub) fait passer l'action à `executed`, le déploiement déclenche `verify()`.

Un **adapter de repo** par projet décrit où vivent les choses : `content_dir`, format du front-matter, convention de slugs, framework (Next.js, Astro, Nuxt…). Fourni en config, ou inféré par un tool d'analyse du repo à l'onboarding.

**Canal 2 — API d'intégration côté site.**
Pour les changements qui ne vivent pas dans le repo (contenu en BDD, sites sans repo accessible). Le site embarque le **SDK Zahra** (`@zahra-seo/sdk`, package du monorepo) qui expose un endpoint authentifié (HMAC + clé par projet) avec des capacités déclarées : `upsertContent`, `updateMeta`, `listContent`, `getRenderedPage`. L'agent découvre les capacités du site (`GET /zahra/capabilities`) et n'utilise que ce qui est déclaré. C'est le canal naturel pour Facturaal/Boutique Sénégal (blog en BDD) et il servira de première implémentation de référence du SDK.

Un projet peut combiner les deux : PRs pour le code/les pages statiques, API pour le contenu dynamique.

### 6.3 Catalogue d'actions v1

| Kind | Mutant | Canal | Description |
|---|---|---|---|
| `technical_audit` | non | — | Crawl + Lighthouse, produit des findings |
| `serp_snapshot` | non | — | État des positions sur les keywords suivis (via GSC) |
| `fix_meta_tags` | oui | PR / API | Title/description manquants, dupliqués, trop longs |
| `add_structured_data` | oui | PR / API | JSON-LD (Organization, Product, FAQ, Article…) |
| `write_article` | oui | PR / API | Brief → article complet (voir §6.4), ciblé sur une opportunité keyword |
| `update_content` | oui | PR / API | Rafraîchir/renforcer une page existante (contenu déclinant ou thin) |
| `internal_linking` | oui | PR / API | Ajouter des liens internes contextuels vers des pages cibles |
| `fix_sitemap_robots` | oui | PR | Corrections sitemap.xml / robots.txt |
| `redirect_fix` | oui | PR / API | Chaînes de redirections, 404 avec backlinks internes |

Le catalogue est un point d'extension officiel du projet : ajouter un tool = implémenter l'interface + le déclarer. C'est là que la communauté open source contribue le plus naturellement.

### 6.4 Génération de contenu — garde-fous

Le contenu est le tool le plus risqué (politique Google sur le *scaled content abuse*). Règles intégrées au tool `write_article` : jamais de publication en masse (budget contenu séparé, ex. 2 articles/semaine max par défaut) ; chaque article part d'une opportunité **observée dans les données** (requête à impressions élevées / CTR faible, gap de couverture), pas d'une liste de mots-clés générée ; brief structuré → draft → passe de critique automatique (fact-check des affirmations chiffrées, détection de remplissage) → approbation humaine obligatoire par défaut, quel que soit le niveau d'autonomie ; front-matter marquant l'origine (`generated_by: zahra`) pour la traçabilité interne.

---

## 7. Human-in-the-loop et niveaux d'autonomie

La politique d'autonomie est **par projet et par type d'action** :

| Niveau | Nom | Comportement |
|---|---|---|
| 0 | `observe` | L'agent analyse et propose, n'exécute rien (mode audit — défaut à l'onboarding) |
| 1 | `approve_all` | Toute action mutante requiert une approbation explicite (défaut après onboarding) |
| 2 | `auto_low_risk` | Auto-exécution des actions à faible risque (meta, schema.org, sitemap) ; approbation pour le contenu |
| 3 | `autonomous` | Auto-exécution dans la limite des budgets ; le contenu long reste approuvé (verrou non désactivable en v1) |

La **montée en autonomie est suggérée, jamais automatique** : quand un type d'action atteint N exécutions consécutives approuvées sans modification et sans régression mesurée, l'agent propose de passer ce type au niveau supérieur. L'humain décide. Chaque approbation où l'humain **édite** la proposition est un signal d'apprentissage (phase 4 : l'agent apprend des corrections, ex. « les titles proposés sont systématiquement raccourcis → viser 50 caractères »).

La file d'approbation (API dès la phase 2, UI en phase 5, notifications par email/webhook entre les deux) montre : le diff du dry-run, le rationale, l'hypothèse, le score, et les learnings qui ont motivé l'action.

---

## 8. Intégrations données (phase 3)

### 8.1 Google Search Console

- **Auth** : OAuth2 (l'utilisateur connecte son compte) ou service account ajouté à la propriété — les deux supportés, service account recommandé en self-hosted.
- **Search Analytics** : sync incrémental quotidien `date × page × query` (+ device/country en agrégé), stocké dans `metric_snapshots`. Latence des données ~2 jours : les fenêtres de mesure en tiennent compte. Quotas confortables pour notre usage (1 200 requêtes/min par site) mais le collector est rate-limité et reprend sur erreur 429.
- **URL Inspection** : quota serré (2 000 requêtes/jour par site) → réservé aux pages prioritaires : nouvelles pages publiées par l'agent, pages en anomalie d'indexation. Jamais de scan complet du site par cette API.
- **Sitemaps API** : soumission/statut des sitemaps.

### 8.2 Google Analytics 4

- **Data API** : sessions organiques, taux d'engagement, conversions par landing page, en sync quotidien. Sert surtout l'Evaluator (le clic GSC ne dit pas si le trafic convertit) et la priorisation (une page qui convertit bien mérite plus d'effort SEO).

### 8.3 Crawler interne

Playwright + Lighthouse dans le worker (Chromium requis dans l'image Docker). Crawl budgété (max pages/cycle), respect de robots.txt, user-agent identifiable (`ZahraBot`). C'est la seule source de données qui fonctionne **dès la phase 1**, sans aucune clé Google — important pour l'expérience d'onboarding open source.

### 8.4 Extensions futures (post-v1, non bloquantes)

Bing Webmaster Tools, données de backlinks (via API tierces optionnelles), suivi SERP direct. L'architecture collector → snapshots normalisés rend ces ajouts non structurants.

---

## 9. Mémoire et apprentissage (phase 4)

### 9.1 Ce que « apprendre » veut dire ici

Pas de fine-tuning, pas de RL : l'apprentissage de Zahra est **symbolique et inspectable**. Trois mécanismes :

1. **Learnings** — des énoncés structurés dérivés des évaluations :
   - *tactic_outcome* : « Sur ce projet, l'ajout de FAQ schema sur les pages produit a produit +18 % de CTR médian (3 confirmations, 0 contradiction). »
   - *site_insight* : « Les articles en wolof/français mixte performent mieux que le français seul sur les requêtes locales. »
   - *constraint* : « L'humain raccourcit systématiquement les titles proposés → viser ≤ 55 caractères. » (appris des éditions en file d'approbation)

   Chaque learning porte `confidence`, `times_confirmed`, `times_contradicted`. Un learning contredit deux fois passe en quarantaine ; les learnings se **périment** (decay de confiance sans confirmation récente) parce que le SEO bouge.

2. **Modificateurs de scoring** — le scorer déterministe (§5.3) ajuste les priorités selon l'historique d'issues par `action_kind` sur le projet : les familles d'actions qui produisent des `success` montent, celles qui accumulent des `neutral` descendent. Effet borné (×0.5 à ×2) pour éviter l'effondrement sur une seule tactique.

3. **Injection dans le Planner** — les learnings actifs pertinents (filtrés par scope de l'action envisagée, sélection par embedding si le volume le justifie) sont injectés dans le prompt du Planner, qui doit citer ceux qui motivent chaque proposition (`rationale`).

### 9.2 Honnêteté statistique

Sur un site de la taille de Facturaal, les volumes sont faibles et le bruit élevé. L'Evaluator est donc volontairement conservateur : verdict `inconclusive` par défaut quand le delta est dans le bruit de la variance historique du scope ; comparaison systématique au mouvement du site entier (si tout le site gagne 10 %, l'action n'y est probablement pour rien) ; les `experiments` (phase 4) permettent des tests contrôlés sur des groupes de pages comparables quand le volume le permet. Le README du projet assumera cette humilité — c'est un argument de sérieux face aux outils qui promettent des causalités.

---

## 10. Multi-projets et open source

### 10.1 Multi-projets

`project_id` partout dès la phase 1 (le coût est nul au départ, la migration a posteriori serait douloureuse). Chaque projet a ses intégrations, sa politique d'autonomie, ses budgets, sa langue et ses contraintes éditoriales, sa mémoire (+ une mémoire globale trans-projets pour les learnings généralisables, avec prudence sur la généralisation). Les queues BullMQ sont partagées mais chaque job porte son `project_id` ; les budgets sont appliqués par projet. Pas de multi-tenancy « SaaS » (organisations, facturation) en v1 : une instance self-hosted = un opérateur, N projets. L'auth v1 est simple (utilisateurs locaux + rôles admin/viewer).

Premiers projets pilotes : **Facturaal** (SaaS, blog + landing pages, canal API), **Boutique Sénégal** (marketplace, fort volume de pages produit, mix PR/API). Deux profils très différents — parfait pour valider la généricité.

### 10.2 Open source

- **Licence** : AGPL-3.0 recommandée (protège contre le SaaS-wrapping par des tiers sans contribution, tout en restant vraiment libre pour le self-hosting). Alternative : Apache-2.0 si la priorité est l'adoption maximale. À trancher avant publication.
- **Structure du repo** (Turborepo) :

```
zahra/
├── apps/
│   ├── api/          # NestJS (HTTP + OpenAPI)
│   ├── worker/       # NestJS (processeurs BullMQ)
│   └── web/          # Next.js (phase 5)
├── packages/
│   ├── core/         # domaine : entités, contrats des tools, scoring
│   ├── tools/        # catalogue d'executors
│   ├── connectors/   # gsc, ga4, github, crawler
│   ├── sdk/          # @zahra-seo/sdk — intégration côté site
│   └── shared/       # types, schémas zod
├── docker-compose.yml
└── docs/             # ce document, guides d'intégration, ADRs
```

- **Rituels OSS dès le jour 1** : ADRs (Architecture Decision Records) pour les choix structurants, CI (lint, tests, build Docker), CONTRIBUTING.md, bonnes first issues sur le catalogue de tools. Le README raconte la boucle (§2.1) — c'est le pitch.
- **Positionnement public** : « an open-source autonomous SEO engineer — observes real data, proposes auditable changes as pull requests, measures what actually worked, and learns from it. » Le différenciateur martelé partout : *closed feedback loop* + *human-in-the-loop* + *auditable par design*.

---

## 11. Roadmap détaillée

### Phase 1 — Socle (fondations sans LLM)

**Objectif : la tuyauterie complète tourne sur un vrai projet, sans intelligence.**

- Monorepo Turborepo, apps `api` + `worker`, Docker Compose, CI.
- Schéma Postgres complet (toutes les tables du §4, y compris celles utilisées plus tard — le schéma est le contrat).
- Queues BullMQ : cycle, crawl, exécution. Cycle cron par projet.
- Crawler interne (sitemap + liens, extraction meta, Lighthouse échantillonné) → `pages`, `findings`.
- Planner v0 à règles : findings techniques → actions proposées (sans exécution : niveau 0).
- API REST : projets, findings, backlog d'actions, cycles.

**Critère de sortie** : Zahra crawle Facturaal chaque nuit et produit un backlog d'actions techniques pertinent, consultable via l'API.

### Phase 2 — Intelligence et exécution

**Objectif : l'agent agit, sous approbation.**

- Intégration Claude : Planner v1 (digest → actions structurées), interface `LlmProvider`.
- Contrat `SeoTool`, executors v1 : `fix_meta_tags`, `add_structured_data`, `write_article`, `fix_sitemap_robots`.
- Canal GitHub PR (app GitHub ou PAT, adapter de repo) + canal Site API (`@zahra-seo/sdk` v0, intégré à Facturaal comme implémentation de référence).
- Approval Gate : file d'approbation (API + notifications email/webhook), niveaux d'autonomie 0–2.
- Suivi des coûts LLM par cycle (`cycles.tokens_used`).

**Critère de sortie** : une PR de correction de meta tags proposée par Zahra, approuvée, mergée, vérifiée — de bout en bout sans intervention manuelle hors approbation.

### Phase 3 — Données réelles

**Objectif : l'agent voit ce que Google voit.**

- Connecteurs GSC (Search Analytics sync incrémental, URL Inspection budgétée, Sitemaps) et GA4 (Data API), OAuth + service accounts.
- `metric_snapshots`, Digest Builder enrichi (mouvements de positions, opportunités CTR, pages déclinantes).
- Evaluator v1 : baseline à l'exécution, verdict à échéance de fenêtre, confounders basiques.
- Le Planner priorise désormais sur données réelles (opportunités keyword, cannibalisation, contenu déclinant).

**Critère de sortie** : chaque action exécutée depuis ≥ 14 jours a une évaluation chiffrée consultable.

### Phase 4 — Mémoire et apprentissage

**Objectif : les résultats d'hier changent les décisions de demain.**

- Table `learnings`, extraction depuis les évaluations et les éditions humaines en approbation.
- Modificateurs de scoring bornés, injection des learnings dans le Planner (avec citation obligatoire).
- Decay/quarantaine des learnings, `experiments` v1 (groupes de pages comparables).
- Suggestions de montée en autonomie par type d'action.

**Critère de sortie** : démontrer sur un cas réel qu'une évaluation a modifié la priorisation d'un cycle ultérieur (traçable dans les logs de cycle).

### Phase 5 — Interface et multi-projets aboutis

**Objectif : utilisable par quelqu'un d'autre que son auteur.**

- `apps/web` Next.js : dashboard par projet (état, backlog, file d'approbation avec diffs, timeline des actions et leurs résultats, mémoire consultable et éditable).
- Onboarding guidé : ajout d'un projet, connexion GitHub/GSC/GA4, inférence de l'adapter de repo.
- Multi-projets rodé sur ≥ 3 sites réels (Facturaal, Boutique Sénégal, + un site tiers pour tester la généricité).
- Documentation complète, site du projet, annonce publique (Show HN, communautés SEO/dev).

**Critère de sortie** : un développeur extérieur installe Zahra et connecte son site en < 30 minutes sans aide.

---

## 12. Risques et questions ouvertes

| Risque | Mitigation |
|---|---|
| **Coût LLM** en fonctionnement continu | Digest compact (pas de dumps bruts), cycle quotidien (pas horaire), budgets tokens/cycle et coût/mois par projet, modèle léger pour les tâches mécaniques et modèle fort pour le Planner/contenu |
| **Politiques Google** (scaled content abuse, contenu de faible valeur) | Garde-fous du §6.4 : volume plafonné, opportunités observées uniquement, critique automatique + approbation humaine sur le contenu, qualité > volume assumée dans le positionnement du projet |
| **Attribution causale fragile** (petits volumes, bruit, core updates) | Evaluator conservateur (§9.2), verdicts `inconclusive` assumés, comparaison au mouvement global du site, experiments contrôlés quand possible |
| **Prompt injection via données crawlées** (une page tierce contient des instructions) | Les contenus crawlés sont traités comme données non fiables : jamais interprétés comme instructions, passés au Planner sous forme extraite/normalisée, allowlist des domaines crawlés (le sien) |
| **Sécurité des credentials** (GitHub, Google, sites) | Chiffrement au repos des tokens, scopes minimaux (app GitHub limitée au repo cible), HMAC + rotation pour le SDK, aucune télémétrie sortante par défaut |
| **Dérive d'un agent autonome** | Budgets durs hors LLM, idempotence par `action_id`, verrou d'approbation sur le contenu long non désactivable en v1, kill-switch par projet (`status: paused`) |

**Questions ouvertes à trancher en avançant** : domaine du site du projet (zahra-seo.dev, getzahra.com…) ; licence (AGPL vs Apache) ; Drizzle vs Prisma ; app GitHub officielle hébergée vs PAT self-hosted uniquement ; place du multilingue (fr/en/wolof) dans le tool de contenu v1.

---

*Document rédigé le 28 juillet 2026 — à faire vivre dans `docs/` du futur repo, découpé en ADRs au fil des décisions.*
