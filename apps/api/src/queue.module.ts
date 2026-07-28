import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUES } from '@zahra-seo/shared';

function redisConnection() {
  const url = new URL(process.env.REDIS_URL ?? 'redis://localhost:6380');
  return { host: url.hostname, port: Number(url.port || 6379) };
}

@Global()
@Module({
  imports: [
    BullModule.forRoot({ connection: redisConnection() }),
    BullModule.registerQueue({ name: QUEUES.cycle }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
