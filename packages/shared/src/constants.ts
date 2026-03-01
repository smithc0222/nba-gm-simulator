export const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;
export type Position = (typeof POSITIONS)[number];

export const DRAFT_STATUSES = ['waiting', 'drafting', 'complete'] as const;
export type DraftStatus = (typeof DRAFT_STATUSES)[number];

export const SERIES_STATUSES = ['pending', 'in_progress', 'complete'] as const;
export type SeriesStatus = (typeof SERIES_STATUSES)[number];

export const PICKS_PER_TEAM = 5;
export const SERIES_WINS_NEEDED = 4;
export const MAX_SERIES_GAMES = 7;

// Home court pattern for best-of-7: team1 home games 1,2,5,7; team2 home games 3,4,6
export const HOME_COURT_PATTERN: (1 | 2)[] = [1, 1, 2, 2, 1, 2, 1];

// Simulation constants
export const BASE_TEAM_SCORE = 100;
export const SCORE_VARIANCE_STDDEV = 9;
export const HOME_COURT_BONUS = 3;

// Snake draft pick order: returns 1 or 2 indicating which pickOrder team picks at a given pickNumber
export function getPickOrder(pickNumber: number): 1 | 2 {
  const round = Math.ceil(pickNumber / 2);
  const posInRound = ((pickNumber - 1) % 2) + 1;
  const isReversed = round % 2 === 0;
  return (isReversed ? (3 - posInRound) : posInRound) as 1 | 2;
}

// Position fit penalties (0 = perfect fit, higher = worse)
export const POSITION_FIT_PENALTY: Record<Position, Record<Position, number>> = {
  PG: { PG: 0, SG: 0.02, SF: 0.05, PF: 0.10, C: 0.15 },
  SG: { PG: 0.02, SG: 0, SF: 0.02, PF: 0.08, C: 0.12 },
  SF: { PG: 0.05, SG: 0.02, SF: 0, PF: 0.02, C: 0.05 },
  PF: { PG: 0.10, SG: 0.08, PF: 0, SF: 0.02, C: 0.02 },
  C:  { PG: 0.15, SG: 0.12, SF: 0.05, PF: 0.02, C: 0 },
};
