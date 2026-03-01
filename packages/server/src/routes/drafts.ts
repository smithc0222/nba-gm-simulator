import type { FastifyInstance } from 'fastify';
import { authGuard } from '../middleware/auth.js';
import { createDraftSchema, makeDraftPickSchema } from '@nba-gm/shared';
import * as draftService from '../services/draft.js';

export async function draftRoutes(app: FastifyInstance) {
  // Create a new draft
  app.post('/api/drafts', { preHandler: authGuard }, async (request, reply) => {
    const parsed = createDraftSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', message: parsed.error.message });
    }

    const draft = await draftService.createDraft(
      request.user!.userId,
      parsed.data.name,
      parsed.data.criteria,
      parsed.data.mode,
      parsed.data.team2Name,
    );
    return { data: draft };
  });

  // Get user's drafts
  app.get('/api/drafts', { preHandler: authGuard }, async (request) => {
    const drafts = await draftService.getUserDrafts(request.user!.userId);
    return { data: drafts };
  });

  // Get draft by ID (full state)
  app.get<{ Params: { id: string } }>('/api/drafts/:id', { preHandler: authGuard }, async (request, reply) => {
    const draftId = parseInt(request.params.id);
    const draft = await draftService.getDraftById(draftId);
    if (!draft) return reply.status(404).send({ error: 'Not found', message: 'Draft not found' });

    const participants = await draftService.getDraftParticipants(draftId);
    const picks = await draftService.getDraftPicks(draftId);
    const currentTurn = draft.status === 'drafting'
      ? draftService.getCurrentTurn(draft.currentPickNumber, participants)
      : null;

    return {
      data: {
        draft,
        participants,
        picks,
        currentTurn,
      },
    };
  });

  // Join a draft by share code
  app.post<{ Params: { shareCode: string } }>('/api/drafts/join/:shareCode', { preHandler: authGuard }, async (request, reply) => {
    const draft = await draftService.getDraftByShareCode(request.params.shareCode);
    if (!draft) return reply.status(404).send({ error: 'Not found', message: 'Draft not found' });
    if (draft.status !== 'waiting') {
      return reply.status(400).send({ error: 'Bad request', message: 'Draft has already started' });
    }

    try {
      const result = await draftService.joinDraft(draft.id, request.user!.userId);
      return { data: { draftId: draft.id, ...result } };
    } catch (e: any) {
      return reply.status(400).send({ error: 'Bad request', message: e.message });
    }
  });

  // Get player pool for a draft
  app.get<{ Params: { id: string }; Querystring: Record<string, string> }>(
    '/api/drafts/:id/players',
    { preHandler: authGuard },
    async (request, reply) => {
      const draft = await draftService.getDraftById(parseInt(request.params.id));
      if (!draft) return reply.status(404).send({ error: 'Not found', message: 'Draft not found' });

      const q = request.query;
      const result = await draftService.getPlayerPool(draft.criteria as any, {
        search: q.search,
        position: q.position as any,
        page: q.page ? parseInt(q.page) : undefined,
        limit: q.limit ? parseInt(q.limit) : undefined,
        sortBy: q.sortBy,
        sortOrder: q.sortOrder as any,
      });

      return result;
    }
  );

  // Make a draft pick
  app.post<{ Params: { id: string } }>('/api/drafts/:id/pick', { preHandler: authGuard }, async (request, reply) => {
    const parsed = makeDraftPickSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', message: parsed.error.message });
    }

    try {
      const result = await draftService.makePick(
        parseInt(request.params.id),
        request.user!.userId,
        parsed.data.playerId,
        parsed.data.position,
      );
      return { data: result };
    } catch (e: any) {
      return reply.status(400).send({ error: 'Bad request', message: e.message });
    }
  });
}
