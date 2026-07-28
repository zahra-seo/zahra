import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class FindingDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  projectId!: string;

  @ApiProperty({
    example: 'missing_meta',
    description: 'Crawler kinds today: missing_meta, duplicate_meta, thin_content, broken_link, multiple_h1. GSC/GA4 kinds arrive in phase 3.',
  })
  kind!: string;

  @ApiProperty({ enum: ['low', 'medium', 'high', 'critical'], example: 'medium' })
  severity!: string;

  @ApiProperty({
    enum: ['open', 'planned', 'resolved', 'ignored'],
    example: 'open',
    description: 'open → planned (an action covers it) → resolved (auto, next crawl) / ignored',
  })
  status!: string;

  @ApiProperty({ enum: ['page', 'keyword', 'site'], example: 'page' })
  entityType!: string;

  @ApiProperty({ example: 'https://facturaal.com/pricing', description: 'URL, query, or "site"' })
  entityRef!: string;

  @ApiProperty({ example: { missing: ['meta_description'] }, description: 'Kind-specific proof gathered at detection' })
  evidence!: Record<string, unknown>;

  @ApiProperty({ example: 'missing_meta:https://facturaal.com/pricing', description: 'Stable dedup key: re-crawls update, never duplicate' })
  fingerprint!: string;

  @ApiProperty({ format: 'date-time' })
  detectedAt!: Date;

  @ApiPropertyOptional({ format: 'date-time', nullable: true, example: null })
  resolvedAt!: Date | null;
}
