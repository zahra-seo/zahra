import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { QUEUES } from './queues';
import { CycleProcessor } from './processors/cycle.processor';
import { CrawlProcessor } from './processors/crawl.processor';

function redisConnection() {
  const url = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
  return { host: url.hostname, port: Number(url.port || 6379) };
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRoot({ connection: redisConnection() }),
    BullModule.registerQueue(
      { name: QUEUES.cycle },
      { name: QUEUES.crawl },
      { name: QUEUES.execute },
      { name: QUEUES.evaluate },
    ),
  ],
  providers: [CycleProcessor, CrawlProcessor],
})
export class WorkerModule {}
