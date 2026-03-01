import type { Position, DraftStatus, SeriesStatus } from './constants.js';
import type { DraftCriteria } from './schemas.js';

export interface User {
  id: number;
  email: string;
  displayName: string;
  createdAt: string;
}

export interface Player {
  id: number;
  nbaId: number;
  name: string;
  draftYear: number | null;
  draftRound: number | null;
  draftNumber: number | null;
  careerStartYear: number;
  careerEndYear: number;
  primaryPosition: Position | null;
}

export interface PlayerSeasonStats {
  playerId: number;
  season: string;
  gamesPlayed: number;
  ppg: number;
  rpg: number;
  apg: number;
  spg: number;
  bpg: number;
  fgPct: number;
  ftPct: number;
  threePct: number;
  minutesPg: number;
}

export interface PlayerWithStats extends Player {
  careerStats: {
    ppg: number;
    rpg: number;
    apg: number;
    spg: number;
    bpg: number;
    fgPct: number;
    ftPct: number;
    threePct: number;
    minutesPg: number;
    gamesPlayed: number;
  };
}

export interface Draft {
  id: number;
  name: string;
  createdBy: number;
  status: DraftStatus;
  criteria: DraftCriteria;
  currentPickNumber: number;
  shareCode: string;
  mode: 'online' | 'local';
  createdAt: string;
}

export interface DraftParticipant {
  draftId: number;
  userId: number;
  pickOrder: number;
  user?: User;
}

export interface DraftPick {
  draftId: number;
  userId: number;
  playerId: number;
  pickNumber: number;
  assignedPosition: Position;
  player?: Player;
}

export interface Series {
  id: number;
  draftId: number;
  team1UserId: number;
  team2UserId: number;
  status: SeriesStatus;
  winnerUserId: number | null;
}

export interface GamePlayerStats {
  playerId: number;
  playerName: string;
  position: Position;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  fgMade: number;
  fgAttempted: number;
  threeMade: number;
  threeAttempted: number;
  ftMade: number;
  ftAttempted: number;
  minutes: number;
}

export interface GameLog {
  team1Players: GamePlayerStats[];
  team2Players: GamePlayerStats[];
}

export interface SeriesGame {
  seriesId: number;
  gameNumber: number;
  team1Score: number;
  team2Score: number;
  winnerUserId: number;
  gameLog: GameLog;
}

export interface LeaderboardEntry {
  userId: number;
  displayName: string;
  wins: number;
  losses: number;
  championships: number;
  winPct: number;
}

// API response types
export interface ApiResponse<T> {
  data: T;
}

export interface ApiError {
  error: string;
  message: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Draft state for real-time updates
export interface DraftState {
  draft: Draft;
  participants: DraftParticipant[];
  picks: (DraftPick & { player: Player })[];
  availablePlayers: PlayerWithStats[];
  currentTurn: { userId: number; pickNumber: number } | null;
}
