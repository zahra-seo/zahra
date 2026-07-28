import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { actions, and, approvals, desc, eq, findings, inArray, type Db } from '@zahra-seo/db';
import { QUEUES, type ExecuteJobData } from '@zahra-seo/shared';
import { DB } from '../../db.module';
import { ActionDecisionResultDto, ActionDto, ApproveActionDto, RejectActionDto } from './actions.dto';

@ApiTags('actions')
@Controller('projects/:projectId/actions')
export class ActionsController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @InjectQueue(QUEUES.execute) private readonly executeQueue: Queue<ExecuteJobData>,
  ) {}

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

  @Post(':id/approve')
  @ApiOperation({
    summary: 'Approve an action — the human-in-the-loop gate',
    description:
      'Moves a proposed action to the execution queue. Optionally pass editedInput to correct or complete ' +
      'the tool input (for fix_meta_tags, this is where you provide the actual title/metaDescription values ' +
      'until the Claude planner drafts them). Edits are recorded: they are how Zahra learns your preferences.',
  })
  @ApiParam({ name: 'projectId', format: 'uuid' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiCreatedResponse({ type: ActionDecisionResultDto })
  @ApiBadRequestResponse({ description: 'Action is not in "proposed" status' })
  @ApiNotFoundResponse({ description: 'Unknown action for this project' })
  async approve(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ApproveActionDto,
  ) {
    const action = await this.getProposed(projectId, id);

    await this.db.insert(approvals).values({
      actionId: id,
      decision: body.editedInput ? 'edit' : 'approve',
      decidedBy: 'api', // real users arrive with auth (phase 5)
      comment: body.comment,
      editedInput: body.editedInput,
    });

    await this.db
      .update(actions)
      .set({
        status: 'queued',
        ...(body.editedInput ? { input: body.editedInput } : {}),
        updatedAt: new Date(),
      })
      .where(eq(actions.id, id));

    const job = await this.executeQueue.add(
      'execute',
      { projectId, actionId: id },
      { jobId: `execute:${id}`, attempts: 5, backoff: { type: 'exponential', delay: 60_000 } },
    );

    return { actionId: id, status: 'queued', jobId: job.id };
  }

  @Post(':id/reject')
  @ApiOperation({
    summary: 'Reject an action',
    description: 'Marks the action rejected and re-opens its findings so a better proposal can cover them later.',
  })
  @ApiParam({ name: 'projectId', format: 'uuid' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiCreatedResponse({ type: ActionDecisionResultDto })
  @ApiBadRequestResponse({ description: 'Action is not in "proposed" status' })
  @ApiNotFoundResponse({ description: 'Unknown action for this project' })
  async reject(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RejectActionDto,
  ) {
    const action = await this.getProposed(projectId, id);

    await this.db.insert(approvals).values({
      actionId: id,
      decision: 'reject',
      decidedBy: 'api',
      comment: body.comment,
    });
    await this.db.update(actions).set({ status: 'rejected', updatedAt: new Date() }).where(eq(actions.id, id));

    const findingIds = (action.findingIds as string[]) ?? [];
    if (findingIds.length > 0) {
      await this.db.update(findings).set({ status: 'open' }).where(inArray(findings.id, findingIds));
    }

    return { actionId: id, status: 'rejected' };
  }

  private async getProposed(projectId: string, id: string) {
    const [action] = await this.db
      .select()
      .from(actions)
      .where(and(eq(actions.id, id), eq(actions.projectId, projectId)));
    if (!action) throw new NotFoundException(`Action ${id} not found for this project`);
    if (action.status !== 'proposed') {
      throw new BadRequestException(`Action is "${action.status}" — only "proposed" actions can be decided`);
    }
    return action;
  }
}
