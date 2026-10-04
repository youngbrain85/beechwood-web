// Display rules of the AASHTO screens (pure): condition state colors, NBI rating bands, defects per category, defect glyph groups, shares.
// Pure functions extracted from the screens.
import { describe, expect, it } from 'vitest';
import { DEFECTS } from './defects';
import {
  BAND_COLOUR,
  CS_COLOUR,
  DEFECT_SYMBOLS,
  NOT_RATED_COLOUR,
  SELECTION_COLOUR,
  csColour,
  defectSymbol,
  defectsForCategory,
  ratingBand,
  share,
} from './display';
import { overallCondition } from './nbi';
import type { ConditionState } from './types';

describe('csColour: condition state colors (fixed values)', () => {
  it('CS1 #2E7D32 · CS2 #F9A825 · CS3 #EF6C00 · CS4 #C62828', () => {
    expect(csColour(1)).toBe('#2E7D32');
    expect(csColour(2)).toBe('#F9A825');
    expect(csColour(3)).toBe('#EF6C00');
    expect(csColour(4)).toBe('#C62828');
  });

  it('the table (CS_COLOUR) and the function give the same values', () => {
    for (const cs of [1, 2, 3, 4] as ConditionState[]) expect(csColour(cs)).toBe(CS_COLOUR[cs]);
  });

  it('the color of an object without an element (not rated) differs from the four CS colors', () => {
    expect(Object.values(CS_COLOUR)).not.toContain(NOT_RATED_COLOUR);
  });
});

describe('ratingBand: SNBI band of an NBI 0-9 rating (Good >= 7, Fair 5-6, Poor <= 4)', () => {
  it('boundaries', () => {
    expect(ratingBand(9)).toBe('good');
    expect(ratingBand(7)).toBe('good');
    expect(ratingBand(6)).toBe('fair');
    expect(ratingBand(5)).toBe('fair');
    expect(ratingBand(4)).toBe('poor');
    expect(ratingBand(0)).toBe('poor');
  });

  it('uses the thresholds of overallCondition: with three equal ratings the band = the overall condition', () => {
    for (let r = 0; r <= 9; r++) {
      expect(ratingBand(r)).toBe(overallCondition({ deck: r, super: r, sub: r }).toLowerCase());
    }
  });

  it('band colors: Good is CS1 green, Fair CS2 yellow, Poor CS4 red (one palette per screen)', () => {
    expect(BAND_COLOUR.good).toBe(CS_COLOUR[1]);
    expect(BAND_COLOUR.fair).toBe(CS_COLOUR[2]);
    expect(BAND_COLOUR.poor).toBe(CS_COLOUR[4]);
  });
});

describe('defectsForCategory: defect options filtered by the element category of an object', () => {
  it('super (beams): has 1110 Cracking (PSC), lacks 1130 Cracking (RC and Other) and 6000 Scour', () => {
    const nos = defectsForCategory('super').map((d) => d.no);
    expect(nos).toContain(1110);
    expect(nos).toContain(2230); // bearings (310) are super: Bulging, Splitting or Tearing
    expect(nos).not.toContain(1130);
    expect(nos).not.toContain(6000);
  });

  it('sub (bents, abutments): has 6000 Scour and 4000 Settlement, lacks the bearing defect (2210)', () => {
    const nos = defectsForCategory('sub').map((d) => d.no);
    expect(nos).toEqual(expect.arrayContaining([1080, 1130, 4000, 6000]));
    expect(nos).not.toContain(2210);
  });

  it('every result applies to the category, and nothing that applies is missing', () => {
    for (const cat of ['deck', 'super', 'sub', 'other'] as const) {
      const got = defectsForCategory(cat);
      expect(got.every((d) => d.appliesTo.includes(cat))).toBe(true);
      expect(got.length).toBe(DEFECTS.filter((d) => d.appliesTo.includes(cat)).length);
    }
  });

  it('ascending defect number (library order kept)', () => {
    const nos = defectsForCategory('deck').map((d) => d.no);
    expect(nos).toEqual([...nos].sort((a, b) => a - b));
  });

  it('the whole list for an unknown category (null)', () => {
    expect(defectsForCategory(null)).toEqual(DEFECTS);
  });
});

describe('defectSymbol: groups defects into the 8 glyphs of the printed sheet LEGEND', () => {
  it('the 8 glyphs are in the sheet legend order', () => {
    expect(DEFECT_SYMBOLS.map((s) => s.key)).toEqual([
      'crack',
      'spall',
      'rebar',
      'efflor',
      'abrasion',
      'corrosion',
      'leakage',
      'settlement',
    ]);
  });

  it('representative defects to glyphs', () => {
    expect(defectSymbol(1110)).toBe('crack');
    expect(defectSymbol(1130)).toBe('crack');
    expect(defectSymbol(3220)).toBe('crack');
    expect(defectSymbol(1080)).toBe('spall');
    expect(defectSymbol(3210)).toBe('spall');
    expect(defectSymbol(1090)).toBe('rebar');
    expect(defectSymbol(1100)).toBe('rebar');
    expect(defectSymbol(1120)).toBe('efflor');
    expect(defectSymbol(1190)).toBe('abrasion');
    expect(defectSymbol(1000)).toBe('corrosion');
    expect(defectSymbol(2310)).toBe('leakage');
    expect(defectSymbol(2330)).toBe('leakage');
    expect(defectSymbol(4000)).toBe('settlement');
    expect(defectSymbol(6000)).toBe('settlement');
  });

  it('defects without a legend glyph (bearing movement, distortion, impact damage) and unknown numbers give other', () => {
    expect(defectSymbol(2210)).toBe('other');
    expect(defectSymbol(2230)).toBe('other');
    expect(defectSymbol(1900)).toBe('other');
    expect(defectSymbol(7000)).toBe('other');
    expect(defectSymbol(99999)).toBe('other');
    expect(defectSymbol(null)).toBe('other');
  });

  it('every defect of the library has a glyph (one of the 8, or other)', () => {
    const keys = new Set([...DEFECT_SYMBOLS.map((s) => s.key), 'other']);
    for (const d of DEFECTS) expect(keys.has(defectSymbol(d.no))).toBe(true);
  });
});

describe('share: quantity share (0-1)', () => {
  it('share of the total', () => {
    expect(share(12, 8316)).toBeCloseTo(0.001443, 6);
    expect(share(4, 1000)).toBe(0.004);
  });

  it('a total of 0 (an object whose quantity is carried by another, like a wall on its cap) gives 0, never a division-by-zero NaN', () => {
    expect(share(0, 0)).toBe(0);
    expect(share(3, 0)).toBe(0);
  });
});

describe('SELECTION_COLOUR: 3D selection highlight (not to be confused with the CS colors of the condition heatmap)', () => {
  const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
  const hue = (hex: string): number => {
    const [r, g, b] = rgb(hex).map((v) => v / 255) as [number, number, number];
    const max = Math.max(r, g, b);
    const d = max - Math.min(r, g, b);
    if (d === 0) return 0;
    const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (h * 60 + 360) % 360;
  };
  const dist = (a: string, b: string): number => Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]!));

  it('is blue (hue 190-250 degrees), a different hue from the green, yellow, orange and red CS colors', () => {
    const h = hue(SELECTION_COLOUR);
    expect(h).toBeGreaterThanOrEqual(190);
    expect(h).toBeLessThanOrEqual(250);
  });

  it('is at least 150 away in RGB distance from CS1-CS4 and the no-element grey', () => {
    for (const c of [...Object.values(CS_COLOUR), NOT_RATED_COLOUR]) expect(dist(SELECTION_COLOUR, c), c).toBeGreaterThan(150);
  });
});
