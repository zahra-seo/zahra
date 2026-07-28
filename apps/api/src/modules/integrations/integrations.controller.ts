import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { and, eq, integrations, type Db } from '@zahra-seo/db';
import { DB } from '../../db.module';
import { zodParse } from '../../zod';

const configSchemas: Record<string, z.ZodSchema> = {
  gsc: z.object({
    siteUrl: z
      .string()
      .min(4)
      .describe('GSC property: "sc-domain:facturaal.com" (domain property) or "https://facturaal.com/" (URL prefix)'),
  }),
  ga4: z.object({ propertyId: z.string().regex(/^\d+$/) }),
  github: z.object({}).passthrough(),
  site_api: z.object({}).passthrough(),
};

@ApiTags('integrations')
@Controller('projects/:projectId/integrations')
export class IntegrationsController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get()
  @ApiOperation({ summary: 'List configured integrations (secrets never returned)' })
  @ApiParam({ name: 'projectId', format: 'uuid' })
  async list(@Param('projectId', ParseUUIDPipe) projectId: string) {
    const rows = await this.db.select().from(integrations).where(eq(integrations.projectId, projectId));
    return rows.map(({ encryptedCredentials: _omit, ...rest }) => rest);
  }

  @Put(':kind')
  @ApiOperation({
    summary: 'Configure an integration (upsert)',
    description:
      'gsc: { "siteUrl": "sc-domain:facturaal.com" } — the service account (env) must be added as a user on the GSC property. ' +
      'ga4: { "propertyId": "123456789" }. Credentials stay in the worker env for now.',
  })
  @ApiParam({ name: 'projectId', format: 'uuid' })
  @ApiParam({ name: 'kind', enum: ['gsc', 'ga4', 'github', 'site_api'] })
  @ApiBody({ schema: { example: { siteUrl: 'sc-domain:facturaal.com' } } })
  @ApiOkResponse({ description: 'The stored integration (without secrets)' })
  async upsert(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('kind') kind: 'gsc' | 'ga4' | 'github' | 'site_api',
    @Body() body: unknown,
  ) {
    const schema = configSchemas[kind] ?? z.object({}).passthrough();
    const config = zodParse(schema, body) as Record<string, unknown>;

    const [existing] = await this.db
      .select()
      .from(integrations)
      .where(and(eq(integrations.projectId, projectId), eq(integrations.kind, kind)));

    if (existing) {
      const [row] = await this.db
        .update(integrations)
        .set({ config, status: 'pending' })
        .where(eq(integrations.id, existing.id))
        .returning();
      const { encryptedCredentials: _omit, ...rest } = row;
      return rest;
    }
    const [row] = await this.db.insert(integrations).values({ projectId, kind, config }).returning();
    const { encryptedCredentials: _omit, ...rest } = row;
    return rest;
  }
}
