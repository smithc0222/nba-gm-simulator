import {
  POSITIONS,
  PICKS_PER_TEAM,
  SERIES_WINS_NEEDED,
  MAX_SERIES_GAMES,
  HOME_COURT_PATTERN,
  BASE_TEAM_SCORE,
  SCORE_VARIANCE_STDDEV,
  HOME_COURT_BONUS,
  POSITION_FIT_PENALTY,
  type Position,
  type GamePlayerStats,
  type GameLog,
  type SeriesGame,
} from '@nba-gm/shared';

interface TeamPlayer {
  playerId: number;
  playerName: string;
  assignedPosition: Position;
  primaryPosition: Position | null;
  stats: {
    ppg: number;
    rpg: number;
    apg: number;
    spg: number;
    bpg: number;
    fgPct: number;
    ftPct: number;
    threePct: number;
    minutesPg: number;
  };
}

// Box-Muller transform for normal distribution
function normalRandom(mean: number, stddev: number): number {
  if (!Number.isFinite(mean)) return 0;
  if (!Number.isFinite(stddev) || stddev <= 0) return mean;
  const u1 = Math.max(Number.MIN_VALUE, Math.random());
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stddev;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getPositionFit(primaryPos: Position | null, assignedPos: Position): number {
  if (!primaryPos) return 0.05; // Unknown position gets a small penalty
  return POSITION_FIT_PENALTY[primaryPos]?.[assignedPos] ?? 0.05;
}

function calculateTeamRatings(team: TeamPlayer[]) {
  let offense = 0;
  let defense = 0;

  for (const player of team) {
    const fit = 1 - getPositionFit(player.primaryPosition, player.assignedPosition);

    // Offense: weighted by PPG, APG, shooting percentages
    const playerOffense =
      player.stats.ppg * 1.0 +
      player.stats.apg * 1.5 +
      player.stats.fgPct * 15 +
      player.stats.threePct * 10 +
      player.stats.ftPct * 5;

    // Defense: weighted by RPG, SPG, BPG
    const playerDefense =
      player.stats.rpg * 1.2 +
      player.stats.spg * 3.0 +
      player.stats.bpg * 3.0;

    offense += playerOffense * fit;
    defense += playerDefense * fit;
  }

  return { offense, defense };
}

function simulateTeamPlayerStats(team: TeamPlayer[], teamScore: number): GamePlayerStats[] {
  // Generate raw points proportional to career PPG with variance
  const rawPoints = team.map(p => Math.max(1, normalRandom(p.stats.ppg, p.stats.ppg * 0.25)));
  const rawSum = rawPoints.reduce((a, b) => a + b, 0);
  const ratio = teamScore / rawSum;

  // Scale and round player points so they sum to teamScore
  const scaledPoints = rawPoints.map(rp => Math.max(0, Math.round(rp * ratio)));
  let remainder = teamScore - scaledPoints.reduce((a, b) => a + b, 0);

  // Distribute remainder to the highest scorer
  if (remainder !== 0) {
    const maxIdx = scaledPoints.indexOf(Math.max(...scaledPoints));
    scaledPoints[maxIdx] += remainder;
  }

  return team.map((player, i) => {
    const points = scaledPoints[i];
    const minutes = 48; // No bench with only 5 players

    // Counting stats from career averages with variance (don't need to reconcile)
    const rebounds = Math.max(0, Math.round(normalRandom(player.stats.rpg, player.stats.rpg * 0.25)));
    const assists = Math.max(0, Math.round(normalRandom(player.stats.apg, player.stats.apg * 0.25)));
    const steals = Math.max(0, Math.round(normalRandom(player.stats.spg, player.stats.spg * 0.4)));
    const blocks = Math.max(0, Math.round(normalRandom(player.stats.bpg, player.stats.bpg * 0.4)));

    // Start from realistic attempt counts, then derive makes
    const ftPct = clamp(normalRandom(player.stats.ftPct, 0.08), 0.3, 1.0);
    const fgPct = clamp(normalRandom(player.stats.fgPct, 0.06), 0.25, 0.70);
    const threePct = clamp(normalRandom(player.stats.threePct, 0.08), 0.05, 0.50);

    // Estimate FTA: ~25% of points come from the free throw line
    const ftAttempted = clamp(Math.round(normalRandom(points * 0.25 / ftPct, 1.5)), 0, 15);
    const ftMade = Math.min(ftAttempted, Math.max(0, Math.round(ftAttempted * ftPct)));

    // Remaining points come from field goals
    const fgPoints = Math.max(0, points - ftMade);

    // Estimate total FGA from field goal points and shooting %
    // Average points per FGA ≈ fgPct * ~2.2 (mix of 2s and 3s)
    const avgPtsPerFga = fgPct * 2.2;
    const fgAttempted = clamp(
      Math.round(normalRandom(fgPoints / Math.max(avgPtsPerFga, 0.5), 2)),
      4, 30
    );

    // Split FGA into 2pt/3pt using threeShare
    const threeShare = clamp(normalRandom(0.3, 0.1), 0.05, 0.6);
    const threeAttempted = Math.max(0, Math.round(fgAttempted * threeShare));
    const twoAttempted = fgAttempted - threeAttempted;

    // Derive makes from attempts × percentage (makes ≤ attempts)
    const threeMade = Math.min(threeAttempted, Math.max(0, Math.round(threeAttempted * threePct)));
    const twoMade = Math.min(twoAttempted, Math.max(0, Math.round(twoAttempted * fgPct)));
    const fgMade = twoMade + threeMade;

    return {
      playerId: player.playerId,
      playerName: player.playerName,
      position: player.assignedPosition,
      points,
      rebounds,
      assists,
      steals,
      blocks,
      fgMade,
      fgAttempted,
      threeMade,
      threeAttempted,
      ftMade,
      ftAttempted,
      minutes,
    };
  });
}

function simulateGame(
  team1: TeamPlayer[],
  team2: TeamPlayer[],
  homeTeam: 1 | 2,
): { team1Score: number; team2Score: number; gameLog: GameLog } {
  const team1Ratings = calculateTeamRatings(team1);
  const team2Ratings = calculateTeamRatings(team2);

  // Expected score differential
  const offenseDiff = (team1Ratings.offense - team2Ratings.offense) * 0.15;
  const defenseDiff = (team1Ratings.defense - team2Ratings.defense) * 0.12;

  const homeBonus = homeTeam === 1 ? HOME_COURT_BONUS : -HOME_COURT_BONUS;

  const expectedDiff = offenseDiff + defenseDiff + homeBonus;

  const team1Score = Math.round(clamp(
    normalRandom(BASE_TEAM_SCORE + expectedDiff / 2, SCORE_VARIANCE_STDDEV),
    75, 140
  ));
  const team2Score = Math.round(clamp(
    normalRandom(BASE_TEAM_SCORE - expectedDiff / 2, SCORE_VARIANCE_STDDEV),
    75, 140
  ));

  // Avoid ties — give edge to home team
  const finalTeam1Score = team1Score === team2Score ? team1Score + (homeTeam === 1 ? 1 : -1) : team1Score;
  const finalTeam2Score = team1Score === team2Score ? team2Score + (homeTeam === 2 ? 1 : -1) : team2Score;

  // Generate individual stats reconciled to team scores
  const gameLog: GameLog = {
    team1Players: simulateTeamPlayerStats(team1, finalTeam1Score),
    team2Players: simulateTeamPlayerStats(team2, finalTeam2Score),
  };

  return { team1Score: finalTeam1Score, team2Score: finalTeam2Score, gameLog };
}

export function simulateSeries(
  team1: TeamPlayer[],
  team2: TeamPlayer[],
  team1UserId: number,
  team2UserId: number,
): { games: Omit<SeriesGame, 'seriesId'>[]; winnerUserId: number } {
  const games: Omit<SeriesGame, 'seriesId'>[] = [];
  let team1Wins = 0;
  let team2Wins = 0;

  for (let gameNum = 0; gameNum < MAX_SERIES_GAMES; gameNum++) {
    if (team1Wins >= SERIES_WINS_NEEDED || team2Wins >= SERIES_WINS_NEEDED) break;

    const homeTeam = HOME_COURT_PATTERN[gameNum];
    const result = simulateGame(team1, team2, homeTeam);

    const winnerUserId = result.team1Score > result.team2Score ? team1UserId : team2UserId;
    if (result.team1Score > result.team2Score) team1Wins++;
    else team2Wins++;

    games.push({
      gameNumber: gameNum + 1,
      team1Score: result.team1Score,
      team2Score: result.team2Score,
      winnerUserId,
      gameLog: result.gameLog,
    });
  }

  return {
    games,
    winnerUserId: team1Wins >= SERIES_WINS_NEEDED ? team1UserId : team2UserId,
  };
}

export type { TeamPlayer };
