import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ActionDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  projectId!: string;

  @ApiProperty({
    example: 'fix_meta_tags',
    description: 'Catalogue v1: technical_audit, serp_snapshot, fix_meta_tags, add_structured_data, write_article, update_content, internal_linking, fix_sitemap_robots, redirect_fix',
  })
  kind!: string;

  @ApiProperty({ example: 'Compléter les meta tags de /pricing' })
  title!: string;

  @ApiProperty({
    example: 'Balises manquantes détectées au crawl : meta_description. Un title et une meta description corrects améliorent le CTR en SERP.',
    description: 'Why the planner proposes this — cites memory learnings from phase 4 onward',
  })
  rationale!: string;

  @ApiPropertyOptional({
    nullable: true,
    example: { metric: 'gsc.ctr', scope: 'page', scopeRef: 'https://facturaal.com/pricing', direction: 'increase', windowDays: 14 },
    description: 'Expected, measurable outcome. Mandatory for mutating actions — no hypothesis, no execution.',
  })
  hypothesis!: Record<string, unknown> | null;

  @ApiProperty({ description: 'Tool input payload (validated against the tool inputSchema at execution)', example: { entityRef: 'https://facturaal.com/pricing' } })
  input!: Record<string, unknown>;

  @ApiProperty({
    enum: ['proposed', 'approved', 'rejected', 'queued', 'executing', 'executed', 'measuring', 'evaluated', 'failed', 'rolled_back'],
    example: 'proposed',
    description: 'Phase 1 stops at "proposed": nothing mutates a site yet. Approval endpoints ship with phase 2.',
  })
  status!: string;

  @ApiProperty({ enum: ['planner', 'rule', 'human'], example: 'rule' })
  source!: string;

  @ApiProperty({ example: 2.05, description: 'score = (impact × confidence) / effort, × age drift, × memory modifier (phase 4). Recomputed deterministically outside the LLM.' })
  score!: number;

  @ApiProperty({ example: { impact: 0.5, confidence: 0.8, effort: 0.2 } })
  estimate!: Record<string, unknown>;

  @ApiProperty({ type: [String], example: ['b3c4d5e6-…'], description: 'Findings this action addresses' })
  findingIds!: string[];

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Cycle that proposed it' })
  createdByCycleId!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;
}
