import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { DbModule } from './db.module';
import { ToolsModule } from './tools.module';
import { LlmModule } from './llm.module';
import { QUEUES } from './queues';
import { SchedulerService } from './scheduler.service';
import { CycleProcessor } from './processors/cycle.processor';
import { CrawlProcessor } from './processors/crawl.processor';
import { PlanProcessor } from './processors/plan.processor';
import { ExecuteProcessor } from './processors/execute.processor';

function redisConnection() {
  const url = new URL(process.env.REDIS_URL ?? 'redis://localhost:6380');
  return { host: url.hostname, port: Number(url.port || 6379) };
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DbModule,
    ToolsModule,
    LlmModule,
    BullModule.forRoot({ connection: redisConnection() }),
    BullModule.registerQueue(
      { name: QUEUES.cycle },
      { name: QUEUES.crawl },
      { name: QUEUES.plan },
      { name: QUEUES.execute },
      { name: QUEUES.evaluate },
    ),
  ],
  providers: [SchedulerService, CycleProcessor, CrawlProcessor, PlanProcessor, ExecuteProcessor],
})
export class WorkerModule {}
