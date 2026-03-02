import api from './client.js';
import type {
  User, Draft, DraftPick, PlayerWithStats,
  Series, SeriesGame, LeaderboardEntry, PaginatedResponse,
  DraftCriteria, GameLog,
} from '@nba-gm/shared';

// Auth
export const register = (email: string, password: string, displayName: string) =>
  api.post<{ data: User; token?: string }>('/auth/register', { email, password, displayName });

export const login = (email: string, password: string) =>
  api.post<{ data: User; token?: string }>('/auth/login', { email, password });

export const logout = () => api.post('/auth/logout');

export const getMe = () => api.get<{ data: User }>('/auth/me');

// Drafts
export const createDraft = (name: string, criteria: DraftCriteria, mode?: 'online' | 'local', team2Name?: string) =>
  api.post<{ data: Draft }>('/drafts', { name, criteria, mode, team2Name });

export const getDrafts = () => api.get<{ data: Draft[] }>('/drafts');

export const getDraft = (id: number) => api.get<{ data: any }>(`/drafts/${id}`);

export const joinDraft = (shareCode: string) =>
  api.post<{ data: { draftId: number; alreadyJoined: boolean } }>(`/drafts/join/${shareCode}`);

export const getDraftPlayers = (draftId: number, params?: Record<string, any>) =>
  api.get<PaginatedResponse<PlayerWithStats>>(`/drafts/${draftId}/players`, { params });

export const makeDraftPick = (draftId: number, playerId: number, position: string) =>
  api.post<{ data: any }>(`/drafts/${draftId}/pick`, { playerId, position });

// Series
export const startSeries = (draftId: number) =>
  api.post<{ data: { series: Series; games: SeriesGame[] } }>(`/drafts/${draftId}/series`);

export const getSeries = (id: number) =>
  api.get<{ data: { series: Series; games: SeriesGame[] } }>(`/series/${id}`);

export const getDraftSeries = (draftId: number) =>
  api.get<{ data: Series[] }>(`/drafts/${draftId}/series`);

// Leaderboard
export const getLeaderboard = () =>
  api.get<{ data: LeaderboardEntry[] }>('/leaderboard');

// User history
export const getUserSeries = (userId: number) =>
  api.get<{ data: Series[] }>(`/users/${userId}/series`);
