import { describe, it, expect } from 'vitest';
import { simulateSeries, type TeamPlayer } from './simulation.js';

function makePlayer(id: number, name: string, pos: 'PG' | 'SG' | 'SF' | 'PF' | 'C'): TeamPlayer {
  return {
    playerId: id,
    playerName: name,
    assignedPosition: pos,
    primaryPosition: pos,
    stats: {
      ppg: 18 + Math.random() * 10,
      rpg: 4 + Math.random() * 6,
      apg: 3 + Math.random() * 5,
      spg: 0.8 + Math.random() * 1.2,
      bpg: 0.3 + Math.random() * 1.5,
      fgPct: 0.42 + Math.random() * 0.1,
      ftPct: 0.7 + Math.random() * 0.15,
      threePct: 0.3 + Math.random() * 0.1,
      minutesPg: 30 + Math.random() * 8,
    },
  };
}

const team1: TeamPlayer[] = [
  makePlayer(1, 'Player A', 'PG'),
  makePlayer(2, 'Player B', 'SG'),
  makePlayer(3, 'Player C', 'SF'),
  makePlayer(4, 'Player D', 'PF'),
  makePlayer(5, 'Player E', 'C'),
];

const team2: TeamPlayer[] = [
  makePlayer(6, 'Player F', 'PG'),
  makePlayer(7, 'Player G', 'SG'),
  makePlayer(8, 'Player H', 'SF'),
  makePlayer(9, 'Player I', 'PF'),
  makePlayer(10, 'Player J', 'C'),
];

function makeZeroThreePlayer(id: number, name: string, pos: 'PG' | 'SG' | 'SF' | 'PF' | 'C'): TeamPlayer {
  return {
    playerId: id,
    playerName: name,
    assignedPosition: pos,
    primaryPosition: pos,
    stats: {
      ppg: 25, rpg: 10, apg: 5, spg: 1.5, bpg: 2.0,
      fgPct: 0.52, ftPct: 0.72, threePct: 0, minutesPg: 36,
    },
  };
}

function makeAllZeroPlayer(id: number, name: string, pos: 'PG' | 'SG' | 'SF' | 'PF' | 'C'): TeamPlayer {
  return {
    playerId: id,
    playerName: name,
    assignedPosition: pos,
    primaryPosition: pos,
    stats: {
      ppg: 0, rpg: 0, apg: 0, spg: 0, bpg: 0,
      fgPct: 0, ftPct: 0, threePct: 0, minutesPg: 0,
    },
  };
}

const ITERATIONS = 50;

describe('simulateSeries', () => {
  for (let run = 0; run < ITERATIONS; run++) {
    it(`iteration ${run + 1}: series invariants hold`, () => {
      const result = simulateSeries(team1, team2, 1001, 1002);

      // Series length
      expect(result.games.length).toBeGreaterThanOrEqual(4);
      expect(result.games.length).toBeLessThanOrEqual(7);

      // Win counts
      let team1Wins = 0;
      let team2Wins = 0;
      for (const game of result.games) {
        if (game.winnerUserId === 1001) team1Wins++;
        else team2Wins++;
      }

      const winnerWins = result.winnerUserId === 1001 ? team1Wins : team2Wins;
      const loserWins = result.winnerUserId === 1001 ? team2Wins : team1Wins;
      expect(winnerWins).toBe(4);
      expect(loserWins).toBeGreaterThanOrEqual(0);
      expect(loserWins).toBeLessThanOrEqual(3);

      // Per-game invariants
      for (const game of result.games) {
        expect(game.team1Score).toBeGreaterThanOrEqual(75);
        expect(game.team1Score).toBeLessThanOrEqual(140);
        expect(game.team2Score).toBeGreaterThanOrEqual(75);
        expect(game.team2Score).toBeLessThanOrEqual(140);
        expect(game.team1Score).not.toBe(game.team2Score);

        // Box score invariants
        const { gameLog } = game;
        expect(gameLog.team1Players).toHaveLength(5);
        expect(gameLog.team2Players).toHaveLength(5);

        // Team points sum to team score
        const t1PointsSum = gameLog.team1Players.reduce((s, p) => s + p.points, 0);
        const t2PointsSum = gameLog.team2Players.reduce((s, p) => s + p.points, 0);
        expect(t1PointsSum).toBe(game.team1Score);
        expect(t2PointsSum).toBe(game.team2Score);

        for (const player of [...gameLog.team1Players, ...gameLog.team2Players]) {
          expect(player.fgAttempted).toBeGreaterThanOrEqual(4);
          expect(player.fgAttempted).toBeLessThanOrEqual(30);
          expect(player.ftAttempted).toBeGreaterThanOrEqual(0);
          expect(player.ftAttempted).toBeLessThanOrEqual(15);
          expect(player.fgMade).toBeLessThanOrEqual(player.fgAttempted);
          expect(player.ftMade).toBeLessThanOrEqual(player.ftAttempted);
          expect(player.threeMade).toBeLessThanOrEqual(player.threeAttempted);
          expect(player.points).toBeGreaterThanOrEqual(0);
          expect(player.rebounds).toBeGreaterThanOrEqual(0);
          expect(player.assists).toBeGreaterThanOrEqual(0);
          expect(player.steals).toBeGreaterThanOrEqual(0);
          expect(player.blocks).toBeGreaterThanOrEqual(0);
          expect(player.minutes).toBe(48);
        }
      }
    });
  }

  describe('pre-3-point-era players (threePct = 0)', () => {
    const preThreeTeam: TeamPlayer[] = [
      makeZeroThreePlayer(11, 'Pre3pt PG', 'PG'),
      makePlayer(12, 'Normal SG', 'SG'),
      makePlayer(13, 'Normal SF', 'SF'),
      makePlayer(14, 'Normal PF', 'PF'),
      makeZeroThreePlayer(15, 'Pre3pt C', 'C'),
    ];

    for (let run = 0; run < 20; run++) {
      it(`iteration ${run + 1}: produces valid scores with zero threePct`, () => {
        const result = simulateSeries(preThreeTeam, team2, 2001, 2002);

        expect(result.games.length).toBeGreaterThanOrEqual(4);
        expect(result.games.length).toBeLessThanOrEqual(7);

        for (const game of result.games) {
          expect(Number.isFinite(game.team1Score)).toBe(true);
          expect(Number.isFinite(game.team2Score)).toBe(true);
          expect(game.team1Score).toBeGreaterThanOrEqual(75);
          expect(game.team1Score).toBeLessThanOrEqual(140);

          for (const player of [...game.gameLog.team1Players, ...game.gameLog.team2Players]) {
            expect(Number.isFinite(player.points)).toBe(true);
            expect(Number.isFinite(player.fgAttempted)).toBe(true);
            expect(Number.isFinite(player.fgMade)).toBe(true);
            expect(Number.isFinite(player.ftAttempted)).toBe(true);
            expect(Number.isFinite(player.ftMade)).toBe(true);
            expect(Number.isFinite(player.threeAttempted)).toBe(true);
            expect(Number.isFinite(player.threeMade)).toBe(true);
          }
        }
      });
    }
  });

  describe('all-zero stats players', () => {
    const zeroTeam: TeamPlayer[] = [
      makeAllZeroPlayer(21, 'Zero PG', 'PG'),
      makeAllZeroPlayer(22, 'Zero SG', 'SG'),
      makeAllZeroPlayer(23, 'Zero SF', 'SF'),
      makeAllZeroPlayer(24, 'Zero PF', 'PF'),
      makeAllZeroPlayer(25, 'Zero C', 'C'),
    ];

    for (let run = 0; run < 20; run++) {
      it(`iteration ${run + 1}: produces valid scores with all-zero stats`, () => {
        const result = simulateSeries(zeroTeam, team2, 3001, 3002);

        expect(result.games.length).toBeGreaterThanOrEqual(4);
        expect(result.games.length).toBeLessThanOrEqual(7);

        for (const game of result.games) {
          expect(Number.isFinite(game.team1Score)).toBe(true);
          expect(Number.isFinite(game.team2Score)).toBe(true);
          expect(game.team1Score).not.toBe(game.team2Score);

          for (const player of [...game.gameLog.team1Players, ...game.gameLog.team2Players]) {
            expect(Number.isFinite(player.points)).toBe(true);
            expect(Number.isFinite(player.fgAttempted)).toBe(true);
            expect(Number.isFinite(player.fgMade)).toBe(true);
          }
        }
      });
    }
  });
});
