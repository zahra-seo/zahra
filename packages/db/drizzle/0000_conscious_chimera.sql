CREATE TYPE "public"."action_source" AS ENUM('planner', 'rule', 'human');--> statement-breakpoint
CREATE TYPE "public"."action_status" AS ENUM('proposed', 'approved', 'rejected', 'queued', 'executing', 'executed', 'measuring', 'evaluated', 'failed', 'rolled_back');--> statement-breakpoint
CREATE TYPE "public"."approval_decision" AS ENUM('approve', 'reject', 'edit');--> statement-breakpoint
CREATE TYPE "public"."evaluation_verdict" AS ENUM('success', 'neutral', 'regression', 'inconclusive');--> statement-breakpoint
CREATE TYPE "public"."execution_channel" AS ENUM('github_pr', 'site_api');--> statement-breakpoint
CREATE TYPE "public"."experiment_status" AS ENUM('draft', 'running', 'finished', 'aborted');--> statement-breakpoint
CREATE TYPE "public"."finding_status" AS ENUM('open', 'planned', 'resolved', 'ignored');--> statement-breakpoint
CREATE TYPE "public"."integration_kind" AS ENUM('gsc', 'ga4', 'github', 'site_api');--> statement-breakpoint
CREATE TYPE "public"."integration_status" AS ENUM('pending', 'connected', 'error', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."keyword_source" AS ENUM('gsc', 'seed', 'planner');--> statement-breakpoint
CREATE TYPE "public"."learning_kind" AS ENUM('tactic_outcome', 'site_insight', 'constraint');--> statement-breakpoint
CREATE TYPE "public"."learning_status" AS ENUM('active', 'quarantined', 'expired');--> statement-breakpoint
CREATE TYPE "public"."metric_scope" AS ENUM('site', 'page', 'keyword', 'page_keyword');--> statement-breakpoint
CREATE TYPE "public"."metric_source" AS ENUM('gsc', 'ga4', 'crawl');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('active', 'paused', 'archived');--> statement-breakpoint
CREATE TYPE "public"."severity" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."site_adapter" AS ENUM('github_pr', 'site_api', 'both');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "action_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action_id" uuid NOT NULL,
	"executor" text NOT NULL,
	"channel" "execution_channel",
	"dry_run" boolean DEFAULT false NOT NULL,
	"artifacts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"rationale" text NOT NULL,
	"hypothesis" jsonb,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "action_status" DEFAULT 'proposed' NOT NULL,
	"source" "action_source" DEFAULT 'rule' NOT NULL,
	"score" real DEFAULT 0 NOT NULL,
	"estimate" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"finding_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by_cycle_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action_id" uuid NOT NULL,
	"decision" "approval_decision" NOT NULL,
	"decided_by" text NOT NULL,
	"comment" text,
	"edited_input" jsonb,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crawl_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"pages_count" integer DEFAULT 0 NOT NULL,
	"issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"lighthouse_scores" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"phase_timings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"planner_input_digest" jsonb,
	"planner_output" jsonb,
	"tokens_used" integer DEFAULT 0 NOT NULL,
	"cost_estimate_cents" integer DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action_id" uuid NOT NULL,
	"window_days" integer NOT NULL,
	"baseline" jsonb NOT NULL,
	"observed" jsonb NOT NULL,
	"delta" jsonb NOT NULL,
	"verdict" "evaluation_verdict" NOT NULL,
	"confidence" real DEFAULT 0 NOT NULL,
	"confounders" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evaluated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "experiments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"hypothesis" text NOT NULL,
	"variant_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"page_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "experiment_status" DEFAULT 'draft' NOT NULL,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"severity" "severity" NOT NULL,
	"status" "finding_status" DEFAULT 'open' NOT NULL,
	"entity_type" text NOT NULL,
	"entity_ref" text NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"fingerprint" text NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" "integration_kind" NOT NULL,
	"status" "integration_status" DEFAULT 'pending' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"encrypted_credentials" text,
	"last_sync_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "keywords" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"query" text NOT NULL,
	"source" "keyword_source" DEFAULT 'gsc' NOT NULL,
	"target_page_id" uuid,
	"intent" text,
	"is_tracked" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "learnings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"kind" "learning_kind" NOT NULL,
	"status" "learning_status" DEFAULT 'active' NOT NULL,
	"statement" text NOT NULL,
	"evidence_action_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confidence" real DEFAULT 0.5 NOT NULL,
	"times_confirmed" integer DEFAULT 0 NOT NULL,
	"times_contradicted" integer DEFAULT 0 NOT NULL,
	"last_confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "metric_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"date" date NOT NULL,
	"source" "metric_source" NOT NULL,
	"scope" "metric_scope" NOT NULL,
	"scope_ref" text NOT NULL,
	"metrics" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"url" text NOT NULL,
	"canonical" text,
	"title" text,
	"meta_description" text,
	"status_code" integer,
	"content_hash" text,
	"indexation_state" text,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_crawled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"base_url" text NOT NULL,
	"status" "project_status" DEFAULT 'active' NOT NULL,
	"adapter" "site_adapter" DEFAULT 'github_pr' NOT NULL,
	"repo_owner" text,
	"repo_name" text,
	"autonomy_policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"budgets" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"editorial" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cycle_cron" text DEFAULT '0 4 * * *' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "action_runs" ADD CONSTRAINT "action_runs_action_id_actions_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."actions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "actions" ADD CONSTRAINT "actions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "actions" ADD CONSTRAINT "actions_created_by_cycle_id_cycles_id_fk" FOREIGN KEY ("created_by_cycle_id") REFERENCES "public"."cycles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "approvals" ADD CONSTRAINT "approvals_action_id_actions_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."actions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "crawl_reports" ADD CONSTRAINT "crawl_reports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cycles" ADD CONSTRAINT "cycles_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_action_id_actions_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."actions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "experiments" ADD CONSTRAINT "experiments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "findings" ADD CONSTRAINT "findings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "integrations" ADD CONSTRAINT "integrations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "keywords" ADD CONSTRAINT "keywords_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "keywords" ADD CONSTRAINT "keywords_target_page_id_pages_id_fk" FOREIGN KEY ("target_page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learnings" ADD CONSTRAINT "learnings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "metric_snapshots" ADD CONSTRAINT "metric_snapshots_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pages" ADD CONSTRAINT "pages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "actions_project_status_idx" ON "actions" USING btree ("project_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "findings_project_fingerprint_idx" ON "findings" USING btree ("project_id","fingerprint");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "findings_project_status_idx" ON "findings" USING btree ("project_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "integrations_project_kind_idx" ON "integrations" USING btree ("project_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "keywords_project_query_idx" ON "keywords" USING btree ("project_id","query");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "learnings_project_status_idx" ON "learnings" USING btree ("project_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "metric_snapshots_unique_idx" ON "metric_snapshots" USING btree ("project_id","date","source","scope","scope_ref");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "metric_snapshots_project_date_idx" ON "metric_snapshots" USING btree ("project_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pages_project_url_idx" ON "pages" USING btree ("project_id","url");