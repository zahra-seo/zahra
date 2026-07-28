import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
  app.setGlobalPrefix('api');

  const config = new DocumentBuilder()
    .setTitle('Zahra API')
    .setDescription(
      'REST API of Zahra, the open-source autonomous SEO engineer. ' +
        'Projects, agent cycles, findings and the action backlog. ' +
        'See docs/api.md and docs/architecture.fr.md in the repository for concepts.',
    )
    .setVersion('0.1')
    .addTag('health', 'Liveness')
    .addTag('projects', 'Tracked sites and manual cycle triggers')
    .addTag('findings', 'Problems & opportunities detected by observation')
    .addTag('actions', 'The backlog: proposed and executed SEO actions')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = Number(process.env.API_PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`Zahra API listening on :${port} — docs at /api/docs`);
}

void bootstrap();
