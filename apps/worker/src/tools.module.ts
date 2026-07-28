import { Global, Module } from '@nestjs/common';
import { createToolRegistry } from '@zahra-seo/tools';
import { ToolRegistry } from '@zahra-seo/core';

@Global()
@Module({
  providers: [
    {
      provide: ToolRegistry,
      useFactory: () => createToolRegistry({ githubToken: process.env.GITHUB_TOKEN ?? '' }),
    },
  ],
  exports: [ToolRegistry],
})
export class ToolsModule {}
