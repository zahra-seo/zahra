import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DbModule } from './db.module';
import { QueueModule } from './queue.module';
import { HealthModule } from './modules/health/health.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { FindingsModule } from './modules/findings/findings.module';
import { ActionsModule } from './modules/actions/actions.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DbModule,
    QueueModule,
    HealthModule,
    ProjectsModule,
    FindingsModule,
    ActionsModule,
  ],
})
export class AppModule {}
