import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { z } from 'zod';
import { ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { QUEUES, type CycleJobData } from '@zahra-seo/shared';
import { ProjectsService } from './projects.service';

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
  list() {
    return this.service.list();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one project' })
  @ApiParam({ name: 'id', format: 'uuid' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(id);
  }

  @Post()
  @ApiOperation({ summary: 'Register a site to track' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name', 'baseUrl'],
      properties: {
        name: { type: 'string', example: 'Facturaal' },
        baseUrl: { type: 'string', format: 'uri', example: 'https://facturaal.com' },
      },
    },
  })
  create(@Body() body: unknown) {
    const input = createProjectSchema.parse(body);
    return this.service.create(input);
  }

  @Post(':id/cycles')
  @ApiOperation({
    summary: 'Trigger one agent cycle now',
    description:
      'Enqueues a full loop turn (observe → plan) for the project, in addition to its cron schedule. ' +
      'Returns the queued job id; progress is visible in findings/actions after ~30s.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  async triggerCycle(@Param('id', ParseUUIDPipe) id: string) {
    await this.service.get(id); // 404 if unknown
    const job = await this.cycleQueue.add('cycle', { projectId: id });
    return { enqueued: true, jobId: job.id };
  }
}
