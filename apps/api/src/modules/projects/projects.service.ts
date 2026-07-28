import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq, projects, type Db } from '@zahra-seo/db';
import { DB } from '../../db.module';

export interface CreateProjectInput {
  name: string;
  baseUrl: string;
}

@Injectable()
export class ProjectsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async list() {
    return this.db.select().from(projects);
  }

  async get(id: string) {
    const [row] = await this.db.select().from(projects).where(eq(projects.id, id));
    if (!row) throw new NotFoundException(`Project ${id} not found`);
    return row;
  }

  async create(input: CreateProjectInput) {
    const [row] = await this.db
      .insert(projects)
      .values({ name: input.name, baseUrl: input.baseUrl })
      .returning();
    return row;
  }
}
