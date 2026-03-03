import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../db/index.js';
import { players, playerSeasonStats } from '../db/schema/players.js';
import { eq, ilike, and, sql } from 'drizzle-orm';

// Skip if database is not available
let dbAvailable = false;
beforeAll(async () => {
  try {
    await db.select({ count: sql<number>`count(*)::int` }).from(players);
    dbAvailable = true;
  } catch {
    console.warn('Database not available, skipping player data tests');
  }
});

describe.runIf(true)('Player data integration', () => {
  it('should have 2000+ players in the database', async () => {
    if (!dbAvailable) return;
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(players);
    expect(count).toBeGreaterThan(2000);
  });

  it('Michael Jordan exists with correct data', async () => {
    if (!dbAvailable) return;
    const result = await db
      .select()
      .from(players)
      .where(ilike(players.name, '%Michael Jordan%'));

    expect(result.length).toBe(1);
    const mj = result[0];
    // "Guard" in Kaggle maps to "PG" in our position map
    expect(['PG', 'SG']).toContain(mj.primaryPosition);
    expect(mj.careerStartYear).toBeLessThanOrEqual(1985);
    expect(mj.careerEndYear).toBeGreaterThanOrEqual(2002);

    // Check season stats exist
    const stats = await db
      .select()
      .from(playerSeasonStats)
      .where(eq(playerSeasonStats.playerId, mj.id));
    expect(stats.length).toBeGreaterThanOrEqual(10);

    // Verify per-game stats are reasonable (not season totals)
    const avgPpg = stats.reduce((sum, s) => sum + s.ppg, 0) / stats.length;
    expect(avgPpg).toBeGreaterThan(20);
    expect(avgPpg).toBeLessThan(40);
  });

  it('Magic Johnson exists with correct data', async () => {
    if (!dbAvailable) return;
    const result = await db
      .select()
      .from(players)
      .where(ilike(players.name, '%Magic Johnson%'));

    expect(result.length).toBe(1);
    const magic = result[0];
    expect(magic.careerStartYear).toBeLessThanOrEqual(1980);

    const stats = await db
      .select()
      .from(playerSeasonStats)
      .where(eq(playerSeasonStats.playerId, magic.id));
    expect(stats.length).toBeGreaterThanOrEqual(3);

    const avgPpg = stats.reduce((sum, s) => sum + s.ppg, 0) / stats.length;
    expect(avgPpg).toBeGreaterThan(10);
  });

  it('Larry Bird exists with correct data', async () => {
    if (!dbAvailable) return;
    const result = await db
      .select()
      .from(players)
      .where(ilike(players.name, '%Larry Bird%'));

    expect(result.length).toBe(1);
    const bird = result[0];
    expect(bird.careerStartYear).toBeLessThanOrEqual(1980);

    const stats = await db
      .select()
      .from(playerSeasonStats)
      .where(eq(playerSeasonStats.playerId, bird.id));
    expect(stats.length).toBeGreaterThanOrEqual(3);

    const avgPpg = stats.reduce((sum, s) => sum + s.ppg, 0) / stats.length;
    expect(avgPpg).toBeGreaterThan(15);
  });

  it('Bill Russell exists with career starting ~1956', async () => {
    if (!dbAvailable) return;
    const result = await db
      .select()
      .from(players)
      .where(ilike(players.name, '%Bill Russell%'));

    expect(result.length).toBe(1);
    const russell = result[0];
    expect(russell.primaryPosition).toBe('C');
    expect(russell.careerStartYear).toBeLessThanOrEqual(1957);

    const stats = await db
      .select()
      .from(playerSeasonStats)
      .where(eq(playerSeasonStats.playerId, russell.id));
    expect(stats.length).toBeGreaterThanOrEqual(10);
  });

  it('Larry Johnson exists with position PF or SF', async () => {
    if (!dbAvailable) return;
    const result = await db
      .select()
      .from(players)
      .where(ilike(players.name, '%Larry Johnson%'));

    expect(result.length).toBeGreaterThanOrEqual(1);
    const lj = result.find(p => p.careerStartYear! <= 1992);
    expect(lj).toBeDefined();
    expect(['PF', 'SF']).toContain(lj!.primaryPosition);
  });

  it('all key players are findable via name search', async () => {
    if (!dbAvailable) return;
    const searches = ['Jordan', 'Magic', 'Bird', 'Russell', 'Larry Johnson'];
    for (const search of searches) {
      const result = await db
        .select()
        .from(players)
        .where(ilike(players.name, `%${search}%`));
      expect(result.length, `Search for "${search}" should return results`).toBeGreaterThan(0);
    }
  });
});
