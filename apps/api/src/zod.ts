import { BadRequestException } from '@nestjs/common';
import type { ZodSchema } from 'zod';

/** Validate a body with zod and surface failures as a clean 400 (not a 500). */
export function zodParse<T>(schema: ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new BadRequestException({
      message: 'Validation failed',
      issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  return result.data;
}
