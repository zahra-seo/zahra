import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { eq, projects, type Db } from '@zahra-seo/db';
import { DB } from './db.module';
import { QUEUES, type CycleJobData } from './queues';

/**
 * Registers one repeatable cycle job per active project (cycle_cron).
 * Uses BullMQ job schedulers: upsert is idempotent, so restarting the worker
 * simply refreshes the schedules.
 */
@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @InjectQueue(QUEUES.cycle) private readonly cycleQueue: Queue<CycleJobData>,
  ) {}

  async onModuleInit(): Promise<void> {
    const active = await this.db.select().from(projects).where(eq(projects.status, 'active'));
    for (const project of active) {
      await this.cycleQueue.upsertJobScheduler(
        `cycle:${project.id}`,
        { pattern: project.cycleCron },
        { name: 'cycle', data: { projectId: project.id } },
      );
      this.logger.log(`Scheduled cycles for "${project.name}" (${project.cycleCron})`);
    }
    this.logger.log(`${active.length} project(s) scheduled`);
  }
}
