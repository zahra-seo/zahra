import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { z } from 'zod';
import { ProjectsService } from './projects.service';

const createProjectSchema = z.object({
  name: z.string().min(1),
  baseUrl: z.string().url(),
});

@Controller('projects')
export class ProjectsController {
  constructor(private readonly service: ProjectsService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(id);
  }

  @Post()
  create(@Body() body: unknown) {
    const input = createProjectSchema.parse(body);
    return this.service.create(input);
  }
}
