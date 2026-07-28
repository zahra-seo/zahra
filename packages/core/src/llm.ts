/**
 * Provider-agnostic LLM contract — Zahra never imports a vendor SDK outside
 * packages/connectors. Structured output only: the planner needs data, not prose.
 */

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface StructuredRequest {
  system: string;
  prompt: string;
  /** JSON Schema the output must conform to (enforced provider-side via tool use). */
  schema: Record<string, unknown>;
  schemaName: string;
  maxTokens?: number;
}

export interface StructuredResponse {
  /** Raw structured output — callers validate with zod before trusting it. */
  data: unknown;
  usage: LlmUsage;
  model: string;
}

export interface LlmProvider {
  generateStructured(req: StructuredRequest): Promise<StructuredResponse>;
}
