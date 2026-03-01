import { z } from 'zod';
import { POSITIONS, DRAFT_STATUSES, SERIES_STATUSES } from './constants.js';

// Auth
export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  displayName: z.string().min(2).max(50),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

// Draft criteria
export const draftCriteriaSchema = z.object({
  activeYearRange: z.object({
    start: z.number().int().min(1946).max(2026),
    end: z.number().int().min(1946).max(2026),
  }).optional(),
  draftClassYear: z.number().int().min(1947).max(2025).optional(),
}).refine(
  (data) => data.activeYearRange || data.draftClassYear,
  { message: 'At least one draft criteria must be specified' }
);

export const createDraftSchema = z.object({
  name: z.string().min(1).max(100),
  criteria: draftCriteriaSchema,
  mode: z.enum(['online', 'local']).default('online'),
  team2Name: z.string().min(2).max(50).optional(),
}).refine(
  (data) => data.mode !== 'local' || (data.team2Name && data.team2Name.length >= 2),
  { message: 'Player 2 name is required for local mode', path: ['team2Name'] }
);

// Draft pick
export const makeDraftPickSchema = z.object({
  playerId: z.number().int().positive(),
  position: z.enum(POSITIONS),
});

// Simulation
export const startSeriesSchema = z.object({
  draftId: z.number().int().positive(),
  opponentUserId: z.number().int().positive(),
});

// Player query
export const playerQuerySchema = z.object({
  search: z.string().optional(),
  position: z.enum(POSITIONS).optional(),
  activeYearStart: z.number().int().optional(),
  activeYearEnd: z.number().int().optional(),
  draftClassYear: z.number().int().optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(25),
  sortBy: z.enum(['name', 'ppg', 'rpg', 'apg', 'spg', 'bpg']).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

// Types inferred from schemas
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type DraftCriteria = z.infer<typeof draftCriteriaSchema>;
export type CreateDraftInput = z.infer<typeof createDraftSchema>;
export type MakeDraftPickInput = z.infer<typeof makeDraftPickSchema>;
export type StartSeriesInput = z.infer<typeof startSeriesSchema>;
export type PlayerQueryInput = z.infer<typeof playerQuerySchema>;
