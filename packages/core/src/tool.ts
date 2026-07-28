import type { ZodSchema } from 'zod';
import type { ActionKind, ExecutionChannel } from '@zahra-seo/shared';

/**
 * Execution context handed to every tool.
 * Deliberately narrow: a tool sees ONE project and nothing else.
 */
export interface ProjectContext {
  projectId: string;
  baseUrl: string;
  /** Adapter config for the repo / site API channels (shape depends on channel). */
  channelConfig: Record<string, unknown>;
}

export interface DryRunReport {
  /** Human-reviewable preview: file diffs or API payloads. */
  summary: string;
  diffs?: Array<{ path: string; before: string | null; after: string }>;
  apiPayload?: Record<string, unknown>;
}

export interface VerifyResult {
  ok: boolean;
  details?: string;
}

/**
 * The contract every executor implements — see docs/architecture.fr.md §6.1.
 * dry-run is mandatory before any mutating execution; execute must be
 * idempotent (idempotency key = action id).
 */
export interface SeoTool<TInput = unknown, TArtifact = unknown> {
  kind: ActionKind;
  mutating: boolean;
  channels: ExecutionChannel[];
  inputSchema: ZodSchema<TInput>;

  dryRun(ctx: ProjectContext, input: TInput): Promise<DryRunReport>;
  execute(ctx: ProjectContext, input: TInput, actionId: string): Promise<TArtifact>;
  verify(ctx: ProjectContext, artifact: TArtifact): Promise<VerifyResult>;
  rollback?(ctx: ProjectContext, artifact: TArtifact): Promise<void>;
}

/** Registry populated by packages/tools (phase 2). */
export class ToolRegistry {
  private tools = new Map<ActionKind, SeoTool>();

  register(tool: SeoTool): void {
    if (this.tools.has(tool.kind)) {
      throw new Error(`Tool already registered for kind "${tool.kind}"`);
    }
    this.tools.set(tool.kind, tool);
  }

  get(kind: ActionKind): SeoTool | undefined {
    return this.tools.get(kind);
  }

  list(): SeoTool[] {
    return [...this.tools.values()];
  }
}
