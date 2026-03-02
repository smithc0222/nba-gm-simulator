import { describe, it, expect } from 'vitest';
import { getPickOrder, POSITIONS, HOME_COURT_PATTERN, POSITION_FIT_PENALTY } from './constants.js';

describe('getPickOrder', () => {
  it('returns snake draft order for 10 picks', () => {
    // Snake: 1-2-2-1-1-2-2-1-1-2
    const expected: (1 | 2)[] = [1, 2, 2, 1, 1, 2, 2, 1, 1, 2];
    for (let i = 1; i <= 10; i++) {
      expect(getPickOrder(i)).toBe(expected[i - 1]);
    }
  });

  it('pick 1 goes to team 1', () => {
    expect(getPickOrder(1)).toBe(1);
  });

  it('picks 2-3 go to team 2 then team 2 (even round snake)', () => {
    expect(getPickOrder(2)).toBe(2);
    expect(getPickOrder(3)).toBe(2);
  });

  it('picks 4-5 go to team 1 (even round reversal)', () => {
    expect(getPickOrder(4)).toBe(1);
    expect(getPickOrder(5)).toBe(1);
  });

  it('full 10-pick snake sequence', () => {
    const sequence = Array.from({ length: 10 }, (_, i) => getPickOrder(i + 1));
    expect(sequence).toEqual([1, 2, 2, 1, 1, 2, 2, 1, 1, 2]);
  });
});

describe('POSITIONS', () => {
  it('contains exactly PG, SG, SF, PF, C', () => {
    expect([...POSITIONS]).toEqual(['PG', 'SG', 'SF', 'PF', 'C']);
  });
});

describe('HOME_COURT_PATTERN', () => {
  it('has 7 games', () => {
    expect(HOME_COURT_PATTERN).toHaveLength(7);
  });

  it('all values are 1 or 2', () => {
    for (const v of HOME_COURT_PATTERN) {
      expect([1, 2]).toContain(v);
    }
  });
});

describe('POSITION_FIT_PENALTY', () => {
  it('self-position penalty is always 0', () => {
    for (const pos of POSITIONS) {
      expect(POSITION_FIT_PENALTY[pos][pos]).toBe(0);
    }
  });

  it('all penalty values are in [0, 1]', () => {
    for (const pos of POSITIONS) {
      for (const targetPos of POSITIONS) {
        const val = POSITION_FIT_PENALTY[pos][targetPos];
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(1);
      }
    }
  });
});
