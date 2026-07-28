import { Controller, Get, Inject, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { and, desc, eq, findings, type Db } from '@zahra-seo/db';
import { DB } from '../../db.module';
import { FindingDto } from './findings.dto';

@ApiTags('findings')
@Controller('projects/:projectId/findings')
export class FindingsController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get()
  @ApiOperation({
    summary: 'List findings for a project',
    description:
      'Problems and opportunities produced by observation (crawl today, GSC/GA4 in phase 3). ' +
      'Ordered newest first, capped at 500. Filter by status to see the live backlog (?status=open).',
  })
  @ApiParam({ name: 'projectId', format: 'uuid' })
  @ApiQuery({ name: 'status', required: false, enum: ['open', 'planned', 'resolved', 'ignored'] })
  @ApiOkResponse({ type: [FindingDto] })
  async list(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query('status') status?: 'open' | 'planned' | 'resolved' | 'ignored',
  ) {
    const where = status
      ? and(eq(findings.projectId, projectId), eq(findings.status, status))
      : eq(findings.projectId, projectId);
    return this.db.select().from(findings).where(where).orderBy(desc(findings.detectedAt)).limit(500);
  }
}
