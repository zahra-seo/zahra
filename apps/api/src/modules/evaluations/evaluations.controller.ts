import { Controller, Get, Inject, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { actions, desc, eq, evaluations, type Db } from '@zahra-seo/db';
import { DB } from '../../db.module';

@ApiTags('evaluations')
@Controller('projects/:projectId/evaluations')
export class EvaluationsController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get()
  @ApiOperation({
    summary: "The agent's scoreboard: verdicts on executed actions",
    description:
      'One row per evaluated action: verdict (success | neutral | regression | inconclusive), confidence, ' +
      'deltas adjusted for site-wide trend, and confounders. This is the data the memory (phase 4) learns from.',
  })
  @ApiParam({ name: 'projectId', format: 'uuid' })
  @ApiOkResponse({ description: 'Evaluations with their action title/kind, newest first (max 200)' })
  async list(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.db
      .select({
        id: evaluations.id,
        actionId: evaluations.actionId,
        actionTitle: actions.title,
        actionKind: actions.kind,
        windowDays: evaluations.windowDays,
        verdict: evaluations.verdict,
        confidence: evaluations.confidence,
        delta: evaluations.delta,
        confounders: evaluations.confounders,
        evaluatedAt: evaluations.evaluatedAt,
      })
      .from(evaluations)
      .innerJoin(actions, eq(evaluations.actionId, actions.id))
      .where(eq(actions.projectId, projectId))
      .orderBy(desc(evaluations.evaluatedAt))
      .limit(200);
  }
}
