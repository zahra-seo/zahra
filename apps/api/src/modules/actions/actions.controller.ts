import { Controller, Get, Inject, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { actions, and, desc, eq, type Db } from '@zahra-seo/db';
import { DB } from '../../db.module';
import { ActionDto } from './actions.dto';

@ApiTags('actions')
@Controller('projects/:projectId/actions')
export class ActionsController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get()
  @ApiOperation({
    summary: 'List the action backlog, best score first',
    description:
      'Actions proposed by the planner (phase 1: deterministic rules; phase 2: Claude). Each carries a ' +
      'rationale, a measurable hypothesis and a deterministic score. Capped at 500.',
  })
  @ApiParam({ name: 'projectId', format: 'uuid' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['proposed', 'approved', 'rejected', 'queued', 'executing', 'executed', 'measuring', 'evaluated', 'failed', 'rolled_back'],
  })
  @ApiOkResponse({ type: [ActionDto] })
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
