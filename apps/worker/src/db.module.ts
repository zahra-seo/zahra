import { Global, Module } from '@nestjs/common';
import { createDb } from '@zahra-seo/db';

export const DB = Symbol('DB');

@Global()
@Module({
  providers: [
    {
      provide: DB,
      useFactory: () =>
        createDb(process.env.DATABASE_URL ?? 'postgres://zahra:zahra@localhost:5433/zahra'),
    },
  ],
  exports: [DB],
})
export class DbModule {}
