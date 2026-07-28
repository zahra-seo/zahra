import { GitHubClient } from '@zahra-seo/connectors';
import { ToolRegistry } from '@zahra-seo/core';
import { FixMetaTagsTool } from './fix-meta-tags';

export * from './fix-meta-tags';

export interface ToolDeps {
  githubToken: string;
}

/** Build the v1 tool registry. Grows with every contributed tool. */
export function createToolRegistry(deps: ToolDeps): ToolRegistry {
  const registry = new ToolRegistry();
  const github = new GitHubClient(deps.githubToken);
  registry.register(new FixMetaTagsTool(github));
  return registry;
}
