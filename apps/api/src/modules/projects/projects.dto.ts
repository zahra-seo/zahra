import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProjectDto {
  @ApiProperty({ example: 'Facturaal', minLength: 1 })
  name!: string;

  @ApiProperty({ example: 'https://facturaal.com', format: 'uri', description: 'Root URL crawled by the agent' })
  baseUrl!: string;
}

export class ProjectDto {
  @ApiProperty({ format: 'uuid', example: '5f6c2f0a-1f2b-4c3d-9e8f-0a1b2c3d4e5f' })
  id!: string;

  @ApiProperty({ example: 'Facturaal' })
  name!: string;

  @ApiProperty({ example: 'https://facturaal.com' })
  baseUrl!: string;

  @ApiProperty({ enum: ['active', 'paused', 'archived'], example: 'active', description: '"paused" is the per-project kill-switch' })
  status!: string;

  @ApiProperty({ enum: ['github_pr', 'site_api', 'both'], example: 'github_pr', description: 'Execution channel (phase 2)' })
  adapter!: string;

  @ApiPropertyOptional({ nullable: true, example: null })
  repoOwner!: string | null;

  @ApiPropertyOptional({ nullable: true, example: null })
  repoName!: string | null;

  @ApiProperty({ description: 'Per-action-kind autonomy policy (§7 of the spec)', example: {} })
  autonomyPolicy!: Record<string, unknown>;

  @ApiProperty({
    description: 'Hard limits applied outside the LLM',
    example: { maxMutatingActionsPerDay: 3, maxArticlesPerWeek: 2, maxCrawlPagesPerCycle: 200, maxTokensPerCycle: 200000 },
  })
  budgets!: Record<string, unknown>;

  @ApiProperty({ description: 'Editorial constraints: language, tone…', example: {} })
  editorial!: Record<string, unknown>;

  @ApiProperty({ example: '0 4 * * *', description: 'Cron of the daily agent cycle (UTC)' })
  cycleCron!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;
}

export class CycleTriggeredDto {
  @ApiProperty({ example: true })
  enqueued!: boolean;

  @ApiProperty({ example: '42', description: 'BullMQ job id — results land in findings/actions within ~1 min' })
  jobId!: string;
}
