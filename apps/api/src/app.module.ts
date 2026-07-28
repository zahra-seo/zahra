import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './modules/health/health.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { DbModule } from './db.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DbModule, HealthModule, ProjectsModule],
})
export class AppModule {}
