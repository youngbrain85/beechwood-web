// NBI component rating rules: four worked examples + boundary coverage of the rating table (9/8/7/6/5/4/3).
// Ladder (one element: total T, s2/s3/s4 = that element's CS quantity / T):
//   9 if s2+s3+s4=0 · 8 if s3+s4=0 && s2<0.10 · 7 if s3+s4=0 · 6 if s4=0 && s3<0.10 ·
//   5 if s4<0.05 · 4 if s4<0.25 · 3 otherwise · T=0 → 9.
// Component rating = minimum ladder rating of the component's elements (total > 0), or 9 with nothing to rate.
// For a component with a single element this equals a rule that sums quantities, so the worked examples and boundaries below hold as they are.
import { describe, expect, it } from 'vitest';
import { aggregate } from './condition';
import { COMPONENT_OF, componentRating, elementRating, overallCondition } from './nbi';
import type { ElementCondition, ElementQuantity, Observation } from './types';

describe('COMPONENT_OF', () => {
  it('deck: 12, 510', () => {
    expect(COMPONENT_OF[12]).toBe('deck');
    expect(COMPONENT_OF[510]).toBe('deck');
  });
  it('super: 109, 310', () => {
    expect(COMPONENT_OF[109]).toBe('super');
    expect(COMPONENT_OF[310]).toBe('super');
  });
  it('sub: 205, 210, 215, 234', () => {
    for (const no of [205, 210, 215, 234]) expect(COMPONENT_OF[no]).toBe('sub');
  });
  it('other (N/A) is null: 321, 301, 305, 331', () => {
    for (const no of [321, 301, 305, 331]) expect(COMPONENT_OF[no]).toBeNull();
  });
});

describe('componentRating: worked examples', () => {
  it('componentRating is 9 for zero quantity (nothing to rate)', () => {
    expect(componentRating([], 'deck')).toBe(9);
  });

  it('CS2 12 sq ft out of deck 8,316 sq ft gives deck rating 8', () => {
    const quantities: ElementQuantity[] = [{ objectCode: 'D', elementNo: 12, quantity: 8316 }];
    const observations: Observation[] = [{ objectCode: 'D', elementNo: 12, defectNo: 1080, cs: 2, quantity: 12 }];
    const conds = aggregate(quantities, observations);
    expect(componentRating(conds, 'deck')).toBe(8);
  });

  it('CS3 4 ft out of beams 1,000 ft gives super rating 6', () => {
    const quantities: ElementQuantity[] = [{ objectCode: 'S', elementNo: 109, quantity: 1000 }];
    const observations: Observation[] = [{ objectCode: 'S', elementNo: 109, defectNo: 1110, cs: 3, quantity: 4 }];
    const conds = aggregate(quantities, observations);
    expect(componentRating(conds, 'super')).toBe(6);
  });

  it('a CS4 share of 0.30 in the substructure gives rating 3', () => {
    const quantities: ElementQuantity[] = [{ objectCode: 'P', elementNo: 205, quantity: 100 }];
    const observations: Observation[] = [{ objectCode: 'P', elementNo: 205, defectNo: 4000, cs: 4, quantity: 30 }];
    const conds = aggregate(quantities, observations);
    expect(componentRating(conds, 'sub')).toBe(3);
  });

  it('with no observations deck/super/sub are all 9 and overallCondition is Good', () => {
    const quantities: ElementQuantity[] = [
      { objectCode: 'D', elementNo: 12, quantity: 8316 },
      { objectCode: 'S', elementNo: 109, quantity: 1000 },
      { objectCode: 'P', elementNo: 205, quantity: 100 },
    ];
    const conds = aggregate(quantities, []);
    const r = {
      deck: componentRating(conds, 'deck'),
      super: componentRating(conds, 'super'),
      sub: componentRating(conds, 'sub'),
    };
    expect(r).toEqual({ deck: 9, super: 9, sub: 9 });
    expect(overallCondition(r)).toBe('Good');
  });

  it('gives 9 when conds has no element of the component at all (N/A)', () => {
    const conds = aggregate([{ objectCode: 'D', elementNo: 12, quantity: 100 }], []);
    // conds holds deck (12) only and no super/sub element, so Q=0 and the rating is 9
    expect(componentRating(conds, 'super')).toBe(9);
    expect(componentRating(conds, 'sub')).toBe(9);
  });
});

describe('componentRating: boundary coverage of the rating table', () => {
  const oneElementConds = (total: number, cs2: number, cs3: number, cs4: number): ElementCondition[] => [
    { elementNo: 12, total, cs: [total - cs2 - cs3 - cs4, cs2, cs3, cs4] },
  ];

  it('s3+s4=0, s2>=0.10 gives 7 (8 fails because it needs s2<0.10)', () => {
    const conds = oneElementConds(100, 15, 0, 0);
    expect(componentRating(conds, 'deck')).toBe(7);
  });

  it('s4=0, s3>=0.10 gives 5 (6 fails because it needs s3<0.10; s4<0.05 holds)', () => {
    const conds = oneElementConds(100, 0, 20, 0);
    expect(componentRating(conds, 'deck')).toBe(5);
  });

  it('s4 from 0.05 up to below 0.25 gives 4', () => {
    const conds = oneElementConds(100, 0, 0, 10);
    expect(componentRating(conds, 'deck')).toBe(4);
  });

  it('s4 below 0.05 (above 0) with some s3 gives 5', () => {
    const conds = oneElementConds(100, 0, 20, 2);
    expect(componentRating(conds, 'deck')).toBe(5);
  });
});

// The two describes above use values beyond a threshold (15/100=0.15 and so on) or inside it, so they
// never step on whether "< 0.10/0.05/0.25" turns true or false exactly at the threshold.
// This group checks separately that the ladder drops to the next step exactly at the threshold
// value itself (=0.10/=0.05/=0.25); total=100 makes the shares exact decimals.
describe('componentRating: ladder thresholds exactly at the value (=0.10/=0.05/=0.25)', () => {
  const oneElementConds = (total: number, cs2: number, cs3: number, cs4: number): ElementCondition[] => [
    { elementNo: 12, total, cs: [total - cs2 - cs3 - cs4, cs2, cs3, cs4] },
  ];

  it('s2 = exactly 0.10 (s3=s4=0): "s2<0.10" is false, so 7 and not 8', () => {
    const conds = oneElementConds(100, 10, 0, 0);
    expect(componentRating(conds, 'deck')).toBe(7);
  });

  it('s3 = exactly 0.10 (s4=0): "s3<0.10" is false, so 5 and not 6 (s4<0.05 holds)', () => {
    const conds = oneElementConds(100, 0, 10, 0);
    expect(componentRating(conds, 'deck')).toBe(5);
  });

  it('s4 = exactly 0.05: "s4<0.05" is false, so 4 and not 5 (s4<0.25 holds)', () => {
    const conds = oneElementConds(100, 0, 0, 5);
    expect(componentRating(conds, 'deck')).toBe(4);
  });

  it('s4 = exactly 0.25: "s4<0.25" is false, so 3 and not 4', () => {
    const conds = oneElementConds(100, 0, 0, 25);
    expect(componentRating(conds, 'deck')).toBe(3);
  });
});

// ------------------------------------------------------------------
//  Minimum of the element ratings (schema.sql v_nbi_components, seed_beechwood.nbi_components):
//  component rating = minimum ladder rating of the component's elements (total > 0), each rated by shares of **its own total**,
//  or 9 with nothing to rate. Quantities of elements with different units (sq ft, ft, each) are never added.
// ------------------------------------------------------------------
describe('elementRating: ladder rating of one element (share = CS quantity / that element\'s total)', () => {
  it('1 of 4 columns in CS4 gives s4 = 0.25, i.e. 3', () => {
    expect(elementRating({ elementNo: 205, total: 4, cs: [3, 0, 0, 1] })).toBe(3);
  });

  it('CS2 6 ft out of a 66 ft cap gives s2 = 0.091, i.e. 8; without defects 9', () => {
    expect(elementRating({ elementNo: 234, total: 66, cs: [60, 6, 0, 0] })).toBe(8);
    expect(elementRating({ elementNo: 234, total: 66, cs: [66, 0, 0, 0] })).toBe(9);
  });

  it('a total of 0 gives 9, like the view\'s coalesce(cs / nullif(total, 0), 0) (no division by zero)', () => {
    expect(elementRating({ elementNo: 205, total: 0, cs: [0, 0, 0, 2] })).toBe(9);
  });
});

describe('componentRating: minimum of the element ratings (elements with different units are not added)', () => {
  it('sub: 1 of 4 columns (each) in CS4 + an undamaged 66 ft cap gives 3 (a mixed-unit sum would give s4 = 1/70 = 0.014, i.e. 5)', () => {
    const quantities: ElementQuantity[] = [
      { objectCode: 'COL', elementNo: 205, quantity: 4 },
      { objectCode: 'CAP', elementNo: 234, quantity: 66 },
    ];
    const observations: Observation[] = [{ objectCode: 'COL', elementNo: 205, defectNo: 1080, cs: 4, quantity: 1 }];
    expect(componentRating(aggregate(quantities, observations), 'sub')).toBe(3);
  });

  it('deck: CS2 12 of 8,316 sq ft on No.12 (8) + CS2 15 of 100 sq ft on No.510 (7) gives 7 (a sum would give s2 = 0.003, i.e. 8)', () => {
    const conds: ElementCondition[] = [
      { elementNo: 12, total: 8316, cs: [8304, 12, 0, 0] },
      { elementNo: 510, total: 100, cs: [85, 15, 0, 0] },
    ];
    expect(componentRating(conds, 'deck')).toBe(7);
  });

  it('skips elements with a total of 0: a CS4 quantity without a total does not pull the component down, and with nothing to rate the result is 9', () => {
    expect(componentRating([{ elementNo: 205, total: 0, cs: [0, 0, 0, 2] }], 'sub')).toBe(9);
    expect(
      componentRating(
        [
          { elementNo: 205, total: 0, cs: [0, 0, 0, 2] },
          { elementNo: 234, total: 66, cs: [60, 6, 0, 0] },
        ],
        'sub',
      ),
    ).toBe(8);
  });

  it('ignores other components and other-category elements: a super CS4 does not change deck', () => {
    const conds: ElementCondition[] = [
      { elementNo: 12, total: 100, cs: [100, 0, 0, 0] },
      { elementNo: 109, total: 10, cs: [0, 0, 0, 10] },
      { elementNo: 331, total: 10, cs: [0, 0, 0, 10] },
    ];
    expect([componentRating(conds, 'deck'), componentRating(conds, 'super')]).toEqual([9, 3]);
  });
});

describe('overallCondition', () => {
  it('Good when the minimum of the three is 7 or more', () => {
    expect(overallCondition({ deck: 7, super: 9, sub: 9 })).toBe('Good');
  });
  it('Fair when the minimum is 5-6', () => {
    expect(overallCondition({ deck: 6, super: 9, sub: 9 })).toBe('Fair');
    expect(overallCondition({ deck: 9, super: 5, sub: 9 })).toBe('Fair');
  });
  it('Poor when the minimum is 4 or less', () => {
    expect(overallCondition({ deck: 9, super: 9, sub: 4 })).toBe('Poor');
    expect(overallCondition({ deck: 0, super: 9, sub: 9 })).toBe('Poor');
  });
});
