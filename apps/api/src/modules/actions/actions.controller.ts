import { Controller, Get, Inject, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { actions, and, desc, eq, type Db } from '@zahra-seo/db';
import { DB } from '../../db.module';

@ApiTags('actions')
@Controller('projects/:projectId/actions')
export class ActionsController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get()
  @ApiOperation({
    summary: 'List the action backlog, best score first',
    description:
      'Actions proposed by the planner (phase 1: rules; phase 2: Claude). Each carries a rationale, ' +
      'a measurable hypothesis and a deterministic score. Lifecycle: proposed → approved/rejected → ' +
      'queued → executing → executed → measuring → evaluated.',
  })
  @ApiParam({ name: 'projectId', format: 'uuid' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: [
      'proposed',
      'approved',
      'rejected',
      'queued',
      'executing',
      'executed',
      'measuring',
      'evaluated',
      'failed',
      'rolled_back',
    ],
  })
  async list(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query('status') status?: string,
  ) {
    const where = status
      ? and(eq(actions.projectId, projectId), eq(actions.status, status as never))
      : eq(actions.projectId, projectId);
    return this.db.select().from(actions).where(where).orderBy(desc(actions.score)).limit(500);
  }
}
