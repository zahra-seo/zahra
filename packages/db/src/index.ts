export * from './schema';
export * from './client';
// Re-export drizzle operators so consumers depend on @zahra-seo/db only,
// never on drizzle-orm directly (pnpm strict node_modules).
export {
  eq,
  ne,
  and,
  or,
  not,
  desc,
  asc,
  inArray,
  notInArray,
  isNull,
  isNotNull,
  lt,
  lte,
  gt,
  gte,
  like,
  ilike,
  sql,
} from 'drizzle-orm';
