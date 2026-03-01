import { describe, it, expect } from 'vitest';
import { getPickOrder } from './constants.js';

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
});
