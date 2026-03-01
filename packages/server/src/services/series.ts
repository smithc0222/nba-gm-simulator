import { eq, and, or, ne, sql, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { series, seriesGames } from '../db/schema/series.js';
import { drafts, draftPicks } from '../db/schema/drafts.js';
import { players, playerSeasonStats } from '../db/schema/players.js';
import { users } from '../db/schema/users.js';
import { simulateSeries, type TeamPlayer } from './simulation.js';
import type { Position } from '@nba-gm/shared';

async function buildTeamPlayers(draftId: number, userId: number): Promise<TeamPlayer[]> {
  const picks = await db
    .select({
      playerId: draftPicks.playerId,
      assignedPosition: draftPicks.assignedPosition,
      playerName: players.name,
      primaryPosition: players.primaryPosition,
      ppg: sql<number>`coalesce(avg(${playerSeasonStats.ppg}), 0)`,
      rpg: sql<number>`coalesce(avg(${playerSeasonStats.rpg}), 0)`,
      apg: sql<number>`coalesce(avg(${playerSeasonStats.apg}), 0)`,
      spg: sql<number>`coalesce(avg(${playerSeasonStats.spg}), 0)`,
      bpg: sql<number>`coalesce(avg(${playerSeasonStats.bpg}), 0)`,
      fgPct: sql<number>`coalesce(avg(${playerSeasonStats.fgPct}), 0)`,
      ftPct: sql<number>`coalesce(avg(${playerSeasonStats.ftPct}), 0)`,
      threePct: sql<number>`coalesce(avg(${playerSeasonStats.threePct}), 0)`,
      minutesPg: sql<number>`coalesce(avg(${playerSeasonStats.minutesPg}), 0)`,
    })
    .from(draftPicks)
    .innerJoin(players, eq(draftPicks.playerId, players.id))
    .leftJoin(playerSeasonStats, eq(players.id, playerSeasonStats.playerId))
    .where(and(eq(draftPicks.draftId, draftId), eq(draftPicks.userId, userId)))
    .groupBy(draftPicks.playerId, draftPicks.assignedPosition, players.name, players.primaryPosition);

  return picks.map(p => ({
    playerId: p.playerId,
    playerName: p.playerName,
    assignedPosition: p.assignedPosition as Position,
    primaryPosition: p.primaryPosition as Position | null,
    stats: {
      ppg: Number(p.ppg),
      rpg: Number(p.rpg),
      apg: Number(p.apg),
      spg: Number(p.spg),
      bpg: Number(p.bpg),
      fgPct: Number(p.fgPct),
      ftPct: Number(p.ftPct),
      threePct: Number(p.threePct),
      minutesPg: Number(p.minutesPg),
    },
  }));
}

export async function createAndSimulateSeries(draftId: number, team1UserId: number, team2UserId: number) {
  const team1 = await buildTeamPlayers(draftId, team1UserId);
  const team2 = await buildTeamPlayers(draftId, team2UserId);

  if (team1.length !== 5 || team2.length !== 5) {
    throw new Error('Both teams must have 5 players');
  }

  const result = simulateSeries(team1, team2, team1UserId, team2UserId);

  // Insert series
  const [newSeries] = await db.insert(series).values({
    draftId,
    team1UserId,
    team2UserId,
    status: 'complete',
    winnerUserId: result.winnerUserId,
  }).returning();

  // Insert games
  for (const game of result.games) {
    await db.insert(seriesGames).values({
      seriesId: newSeries.id,
      gameNumber: game.gameNumber,
      team1Score: game.team1Score,
      team2Score: game.team2Score,
      winnerUserId: game.winnerUserId,
      gameLog: game.gameLog,
    });
  }

  return { series: newSeries, games: result.games };
}

export async function getSeriesById(seriesId: number) {
  const [s] = await db.select().from(series).where(eq(series.id, seriesId));
  return s;
}

export async function getSeriesGames(seriesId: number) {
  return db.select().from(seriesGames)
    .where(eq(seriesGames.seriesId, seriesId))
    .orderBy(seriesGames.gameNumber);
}

export async function getSeriesForDraft(draftId: number) {
  return db.select().from(series).where(eq(series.draftId, draftId));
}

export async function getLeaderboard() {
  const result = await db
    .select({
      userId: users.id,
      displayName: users.displayName,
      wins: sql<number>`count(case when ${series.winnerUserId} = ${users.id} then 1 end)::int`,
      losses: sql<number>`count(case when ${series.winnerUserId} != ${users.id} and ${series.status} = 'complete' then 1 end)::int`,
    })
    .from(users)
    .innerJoin(
      series,
      or(eq(series.team1UserId, users.id), eq(series.team2UserId, users.id))
    )
    .innerJoin(drafts, eq(series.draftId, drafts.id))
    .where(and(eq(series.status, 'complete'), ne(drafts.mode, 'local')))
    .groupBy(users.id, users.displayName)
    .orderBy(desc(sql`count(case when ${series.winnerUserId} = ${users.id} then 1 end)`));

  return result.map(r => ({
    userId: r.userId,
    displayName: r.displayName,
    wins: r.wins,
    losses: r.losses,
    championships: r.wins, // Each series win is a "championship"
    winPct: r.wins + r.losses > 0 ? r.wins / (r.wins + r.losses) : 0,
  }));
}

export async function getUserSeriesHistory(userId: number) {
  return db
    .select({
      id: series.id,
      draftId: series.draftId,
      team1UserId: series.team1UserId,
      team2UserId: series.team2UserId,
      status: series.status,
      winnerUserId: series.winnerUserId,
    })
    .from(series)
    .where(or(eq(series.team1UserId, userId), eq(series.team2UserId, userId)))
    .orderBy(desc(series.id));
}
