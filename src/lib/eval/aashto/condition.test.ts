// Condition state totals per element. Worked examples: "deck 8,316 sq ft with one CS2 12 sq ft gives
// CS1 = 8,304" and "aggregate floors CS1 at 0 when observations exceed the total".
import { describe, expect, it } from 'vitest';
import { aggregate, worstCsByObject } from './condition';
import type { ElementQuantity, Observation } from './types';

describe('aggregate', () => {
  it('gives an empty array for no input', () => {
    expect(aggregate([], [])).toEqual([]);
  });

  it('with no observations CS1 = total and CS2..4 = 0', () => {
    const quantities: ElementQuantity[] = [{ objectCode: 'BW_DECK_A', elementNo: 12, quantity: 8316 }];
    expect(aggregate(quantities, [])).toEqual([{ elementNo: 12, total: 8316, cs: [8316, 0, 0, 0] }]);
  });

  it('worked example: deck 8,316 sq ft with a CS2 12 sq ft observation gives CS1 = 8,304', () => {
    const quantities: ElementQuantity[] = [{ objectCode: 'BW_DECK_A', elementNo: 12, quantity: 8316 }];
    const observations: Observation[] = [
      { objectCode: 'BW_DECK_A', elementNo: 12, defectNo: 1080, cs: 2, quantity: 12 },
    ];
    expect(aggregate(quantities, observations)).toEqual([{ elementNo: 12, total: 8316, cs: [8304, 12, 0, 0] }]);
  });

  it('worked example: beams 1,000 ft with a CS3 4 ft observation', () => {
    const quantities: ElementQuantity[] = [{ objectCode: 'BW_BEAM_A1', elementNo: 109, quantity: 1000 }];
    const observations: Observation[] = [
      { objectCode: 'BW_BEAM_A1', elementNo: 109, defectNo: 1110, cs: 3, quantity: 4 },
    ];
    expect(aggregate(quantities, observations)).toEqual([{ elementNo: 109, total: 1000, cs: [996, 0, 4, 0] }]);
  });

  it('sums quantities and observations of several objects with the same elementNo into one entry', () => {
    const quantities: ElementQuantity[] = [
      { objectCode: 'BW_COL_B2_1', elementNo: 205, quantity: 6 },
      { objectCode: 'BW_COL_B2_2', elementNo: 205, quantity: 6 },
      { objectCode: 'BW_COL_B3_1', elementNo: 205, quantity: 6 },
    ];
    const observations: Observation[] = [
      { objectCode: 'BW_COL_B2_1', elementNo: 205, defectNo: 4000, cs: 4, quantity: 1 },
      { objectCode: 'BW_COL_B3_1', elementNo: 205, defectNo: 4000, cs: 4, quantity: 1 },
    ];
    expect(aggregate(quantities, observations)).toEqual([{ elementNo: 205, total: 18, cs: [16, 0, 0, 2] }]);
  });

  it('floors CS1 at 0 instead of going negative when observations exceed the total', () => {
    const quantities: ElementQuantity[] = [{ objectCode: 'X', elementNo: 205, quantity: 10 }];
    const observations: Observation[] = [
      { objectCode: 'X', elementNo: 205, defectNo: 1080, cs: 3, quantity: 8 },
      { objectCode: 'X', elementNo: 205, defectNo: 1090, cs: 4, quantity: 5 },
    ];
    expect(aggregate(quantities, observations)).toEqual([{ elementNo: 205, total: 10, cs: [0, 0, 8, 5] }]);
  });

  it('ignores an observation with cs=1 (CS1 is derived from the total, not observed)', () => {
    const quantities: ElementQuantity[] = [{ objectCode: 'X', elementNo: 12, quantity: 100 }];
    // An input that should not occur (the ConditionState type allows 1, hence the guard):
    // with a cs=1 observation mixed in, only the real CS2 observation counts and the cs=1 quantity goes nowhere.
    const observations: Observation[] = [
      { objectCode: 'X', elementNo: 12, defectNo: 1080, cs: 1, quantity: 999 },
      { objectCode: 'X', elementNo: 12, defectNo: 1080, cs: 2, quantity: 3 },
    ];
    expect(aggregate(quantities, observations)).toEqual([{ elementNo: 12, total: 100, cs: [97, 3, 0, 0] }]);
  });

  it('leaves out observations of an elementNo that has no quantities (total undefined)', () => {
    const quantities: ElementQuantity[] = [{ objectCode: 'A', elementNo: 12, quantity: 100 }];
    const observations: Observation[] = [{ objectCode: 'B', elementNo: 999, defectNo: 7000, cs: 2, quantity: 5 }];
    expect(aggregate(quantities, observations)).toEqual([{ elementNo: 12, total: 100, cs: [100, 0, 0, 0] }]);
  });

  it('different elementNo values come out as separate entries', () => {
    const quantities: ElementQuantity[] = [
      { objectCode: 'A', elementNo: 12, quantity: 100 },
      { objectCode: 'B', elementNo: 109, quantity: 50 },
    ];
    const result = aggregate(quantities, []);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.elementNo).sort((a, b) => a - b)).toEqual([12, 109]);
  });
});

describe('worstCsByObject', () => {
  it('gives an empty Map for no observations', () => {
    expect(worstCsByObject([]).size).toBe(0);
  });

  it('picks the worst (highest) condition state per object', () => {
    const observations: Observation[] = [
      { objectCode: 'A', elementNo: 12, defectNo: 1080, cs: 2, quantity: 5 },
      { objectCode: 'A', elementNo: 12, defectNo: 1090, cs: 4, quantity: 1 },
      { objectCode: 'B', elementNo: 109, defectNo: 1000, cs: 3, quantity: 2 },
    ];
    const result = worstCsByObject(observations);
    expect(result.get('A')).toBe(4);
    expect(result.get('B')).toBe(3);
    expect(result.has('C')).toBe(false);
  });

  it('keeps the maximum whatever the input order', () => {
    const observations: Observation[] = [
      { objectCode: 'A', elementNo: 12, defectNo: 1080, cs: 4, quantity: 1 },
      { objectCode: 'A', elementNo: 12, defectNo: 1090, cs: 2, quantity: 5 },
    ];
    expect(worstCsByObject(observations).get('A')).toBe(4);
  });
});
