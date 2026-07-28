import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';

async function bootstrap() {
  // Application context only: no HTTP server, just BullMQ processors.
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
  // eslint-disable-next-line no-console
  console.log('Zahra worker started — queues: cycle, crawl, execute, evaluate');
}

void bootstrap();
