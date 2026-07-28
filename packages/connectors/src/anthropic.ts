import type { LlmProvider, StructuredRequest, StructuredResponse } from '@zahra-seo/core';

/**
 * Anthropic implementation of LlmProvider — pure fetch on the Messages API.
 * Structured output is enforced by declaring ONE tool carrying the JSON schema
 * and forcing the model to call it (tool_choice) — no free-text parsing.
 */
export class AnthropicProvider implements LlmProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model = process.env.ZAHRA_PLANNER_MODEL ?? 'claude-sonnet-4-5',
    private readonly baseUrl = 'https://api.anthropic.com',
  ) {}

  async generateStructured(req: StructuredRequest): Promise<StructuredResponse> {
    const res = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: req.maxTokens ?? 4096,
        system: req.system,
        messages: [{ role: 'user', content: req.prompt }],
        tools: [
          {
            name: req.schemaName,
            description: 'Return the structured result. Always call this tool.',
            input_schema: req.schema,
          },
        ],
        tool_choice: { type: 'tool', name: req.schemaName },
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Anthropic API ${res.status}: ${text.slice(0, 400)}`);
    }

    const body = (await res.json()) as {
      content: Array<{ type: string; input?: unknown }>;
      usage: { input_tokens: number; output_tokens: number };
      model: string;
    };

    const toolUse = body.content.find((c) => c.type === 'tool_use');
    if (!toolUse?.input) throw new Error('Anthropic response contained no tool_use block');

    return {
      data: toolUse.input,
      usage: { inputTokens: body.usage.input_tokens, outputTokens: body.usage.output_tokens },
      model: body.model,
    };
  }
}
