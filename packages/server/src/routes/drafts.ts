import type { FastifyInstance } from 'fastify';
import { authGuard, verifyToken } from '../middleware/auth.js';
import { createDraftSchema, makeDraftPickSchema, coinTossCallSchema } from '@nba-gm/shared';
import * as draftService from '../services/draft.js';
import { addConnection, removeConnection } from '../services/sse.js';

function parseId(raw: string): number {
  const id = parseInt(raw, 10);
  if (Number.isNaN(id)) throw { statusCode: 400, message: 'Invalid ID parameter' };
  return id;
}

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
    const draftId = parseId(request.params.id);
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

  // SSE stream for draft updates
  app.get<{ Params: { id: string } }>('/api/drafts/:id/events', async (request, reply) => {
    // Auth manually — EventSource can't set custom headers, so read cookie
    const token = request.cookies?.token;
    if (!token) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'No token provided' });
    }
    let user;
    try {
      user = verifyToken(token);
    } catch {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Invalid token' });
    }

    const draftId = parseId(request.params.id);
    const draft = await draftService.getDraftById(draftId);
    if (!draft) return reply.status(404).send({ error: 'Not found', message: 'Draft not found' });

    // Set SSE headers and hijack the response
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    reply.hijack();

    // Send initial state
    const participants = await draftService.getDraftParticipants(draftId);
    const picks = await draftService.getDraftPicks(draftId);
    const currentTurn = draft.status === 'drafting'
      ? draftService.getCurrentTurn(draft.currentPickNumber, participants)
      : null;

    const { formatSSE } = await import('../services/sse.js');
    reply.raw.write(formatSSE('state', {
      data: { draft, participants, picks, currentTurn },
    }));

    // Register connection
    const conn = addConnection(draftId, reply);

    request.raw.on('close', () => {
      removeConnection(draftId, conn);
    });
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

  // Call coin toss
  app.post<{ Params: { id: string } }>('/api/drafts/:id/coin-toss', { preHandler: authGuard }, async (request, reply) => {
    const draftId = parseId(request.params.id);
    const parsed = coinTossCallSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', message: parsed.error.message });
    }

    try {
      const result = await draftService.callCoinToss(
        draftId,
        request.user!.userId,
        parsed.data.call,
      );
      return { data: result };
    } catch (e: any) {
      return reply.status(400).send({ error: 'Bad request', message: e.message });
    }
  });

  // Get player pool for a draft
  app.get<{ Params: { id: string }; Querystring: Record<string, string> }>(
    '/api/drafts/:id/players',
    { preHandler: authGuard },
    async (request, reply) => {
      try {
        const draftId = parseId(request.params.id);
        const draft = await draftService.getDraftById(draftId);
        if (!draft) return reply.status(404).send({ error: 'Not found', message: 'Draft not found' });

        const q = request.query;
        const picks = await draftService.getDraftPicks(draftId);
        const excludePlayerIds = picks.map(p => p.playerId);
        const result = await draftService.getPlayerPool(draft.criteria as any, {
          search: q.search,
          position: q.position as any,
          page: q.page ? parseInt(q.page) : undefined,
          limit: q.limit ? parseInt(q.limit) : undefined,
          sortBy: q.sortBy,
          sortOrder: q.sortOrder as any,
          excludePlayerIds,
        });

        return result;
      } catch (e: any) {
        if (e.statusCode) return reply.status(e.statusCode).send({ error: 'Bad request', message: e.message });
        request.log.error(e);
        return reply.status(500).send({ error: 'Internal server error', message: 'Failed to load player pool' });
      }
    }
  );

  // Make a draft pick
  app.post<{ Params: { id: string } }>('/api/drafts/:id/pick', { preHandler: authGuard }, async (request, reply) => {
    const draftId = parseId(request.params.id);
    const parsed = makeDraftPickSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', message: parsed.error.message });
    }

    try {
      const result = await draftService.makePick(
        draftId,
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
