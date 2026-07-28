import { Global, Logger, Module } from '@nestjs/common';
import { AnthropicProvider } from '@zahra-seo/connectors';
import type { LlmProvider } from '@zahra-seo/core';

export const LLM = Symbol('LLM');

/**
 * Provides LlmProvider | null. No ANTHROPIC_API_KEY → null → the planner
 * falls back to deterministic rules. Zahra stays fully usable without a key.
 */
@Global()
@Module({
  providers: [
    {
      provide: LLM,
      useFactory: (): LlmProvider | null => {
        const key = process.env.ANTHROPIC_API_KEY;
        if (!key) {
          new Logger('LlmModule').warn('ANTHROPIC_API_KEY not set — planner will use rules only');
          return null;
        }
        return new AnthropicProvider(key);
      },
    },
  ],
  exports: [LLM],
})
export class LlmModule {}
