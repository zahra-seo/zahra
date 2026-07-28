import { Controller, Get, Inject, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { and, desc, eq, findings, type Db } from '@zahra-seo/db';
import { DB } from '../../db.module';

@ApiTags('findings')
@Controller('projects/:projectId/findings')
export class FindingsController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get()
  @ApiOperation({
    summary: 'List findings for a project',
    description:
      'Problems and opportunities produced by observation (crawl, and later GSC/GA4). ' +
      'Lifecycle: open → planned (an action covers it) → resolved | ignored.',
  })
  @ApiParam({ name: 'projectId', format: 'uuid' })
  @ApiQuery({ name: 'status', required: false, enum: ['open', 'planned', 'resolved', 'ignored'] })
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
