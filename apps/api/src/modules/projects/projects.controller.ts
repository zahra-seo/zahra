import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { z } from 'zod';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { QUEUES, type CycleJobData } from '@zahra-seo/shared';
import { ProjectsService } from './projects.service';
import { CreateProjectDto, CycleTriggeredDto, ProjectDto } from './projects.dto';
import { zodParse } from '../../zod';

const createProjectSchema = z.object({
  name: z.string().min(1),
  baseUrl: z.string().url(),
});

@ApiTags('projects')
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly service: ProjectsService,
    @InjectQueue(QUEUES.cycle) private readonly cycleQueue: Queue<CycleJobData>,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List tracked projects' })
  @ApiOkResponse({ type: [ProjectDto] })
  list() {
    return this.service.list();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one project' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: ProjectDto })
  @ApiNotFoundResponse({ description: 'Unknown project id' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(id);
  }

  @Post()
  @ApiOperation({
    summary: 'Register a site to track',
    description:
      'Creates the project with sane defaults: status=active, daily cycle at 04:00 UTC, ' +
      'budgets { maxCrawlPagesPerCycle: 200, … }. The worker registers the cron at boot — ' +
      'restart it after adding a project, or trigger cycles manually.',
  })
  @ApiCreatedResponse({ type: ProjectDto })
  @ApiBadRequestResponse({
    description: 'Validation failed',
    schema: {
      example: {
        message: 'Validation failed',
        issues: [{ path: 'baseUrl', message: 'Invalid url' }],
        error: 'Bad Request',
        statusCode: 400,
      },
    },
  })
  create(@Body() body: CreateProjectDto) {
    const input = zodParse(createProjectSchema, body);
    return this.service.create(input);
  }

  @Post(':id/cycles')
  @ApiOperation({
    summary: 'Trigger one agent cycle now',
    description:
      'Enqueues a full loop turn (observe → plan) in addition to the cron schedule. ' +
      'Watch the worker logs, then check findings and actions after ~30–60s.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiCreatedResponse({ type: CycleTriggeredDto })
  @ApiNotFoundResponse({ description: 'Unknown project id' })
  async triggerCycle(@Param('id', ParseUUIDPipe) id: string) {
    await this.service.get(id); // 404 if unknown
    const job = await this.cycleQueue.add('cycle', { projectId: id });
    return { enqueued: true, jobId: job.id };
  }
}
