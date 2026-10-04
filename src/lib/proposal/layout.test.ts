import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Arrangement } from './compositions';
import type { LayoutResult } from './layout';
import { FRAME, layoutViews } from './layout';

/* Drawing area [mx,my,mw,mh]; a view "fits" only when its label band is inside too. */
const [MX, MY, MW, MH] = FRAME.main;
const TOL = 1e-6;

/* Is one rectangle inside the drawing area including its label band (the same geometry as the fits test of buildLayout). */
function insideMain(r: { x: number; y: number; w: number; h: number }): boolean {
  return (
    [r.x, r.y, r.w, r.h].every(Number.isFinite)
    && r.x >= MX - TOL
    && r.y - FRAME.labelBand >= MY - TOL
    && r.x + r.w <= MX + MW + TOL
    && r.y + r.h <= MY + MH + TOL
  );
}

/* Asserts non-null first and narrows; the return type is `| null`, so it cannot be read directly. */
function must(r: LayoutResult | null): LayoutResult {
  expect(r).not.toBeNull();
  return r!;
}

describe('layoutViews', () => {
  it('one 20x10 m view: A3 1:75, centered in the drawing area', () => {
    const r = must(layoutViews([[20, 10]], ['single']));
    expect([r.paper, r.denomPaper, r.warnings]).toEqual(['A3', 75, []]);
    expect(r.rects[0]!.w).toBeCloseTo(266.667, 2);
    expect(r.rects[0]!.x).toBeCloseTo(10 + (304 - 266.667) / 2, 2);
    expect(r.info.scale).toBe('1:75');
    expect(r.placements[0]!.map((v) => Math.round(v * 1e5) / 1e5)).toEqual([0.06825, 0.23597, 0.63492, 0.44893]);
  });
  it('60x10 m: 1:250 on A3, so A1 1:125 (A3-coordinate denominator 250)', () => {
    const r = must(layoutViews([[60, 10]], ['single']));
    expect([r.paper, r.denomA3, r.denomPaper, r.warnings]).toEqual(['A1', 250, 125, []]);
  });
  it('450x40 m: 1:1000 even on A1, with the small-scale warning', () => {
    const r = must(layoutViews([[450, 40]], ['single']));
    expect([r.paper, r.denomPaper, r.warnings]).toEqual(['A1', 1000, ['scale_small']]);
  });
  it('picks the larger scale of row and stack, and no layout leaves the drawing area', () => {
    const tall = must(layoutViews([[4, 30], [4, 30], [4, 30], [4, 30]], ['row', 'stack']));
    expect(tall.arrangement).toBe('row');
    const wide = must(layoutViews([[40, 2], [40, 3], [40, 2]], ['row', 'stack']));
    expect(wide.arrangement).toBe('stack');
    for (const r of [tall, wide]) for (const q of r.rects) {
      expect(q.x).toBeGreaterThanOrEqual(10); expect(q.y).toBeGreaterThanOrEqual(22);
      expect(q.x + q.w).toBeLessThanOrEqual(314 + 1e-6); expect(q.y + q.h).toBeLessThanOrEqual(245 + 1e-6);
    }
  });
  it('three-view: plan on top, front below, side to the right', () => {
    const r = must(layoutViews([[10, 4], [10, 6], [4, 6]], ['three_view']));
    const [plan, front, side] = r.rects as [typeof r.rects[0], typeof r.rects[0], typeof r.rects[0]];
    expect(plan.y).toBeLessThan(front.y);
    expect(side.x).toBeGreaterThan(front.x + front.w);
    expect(side.y).toBeCloseTo(front.y, 6);
  });
  it('grid: many flat views are drawn larger than in one row: 6 views at A3 1:125', () => {
    const six: Array<[number, number]> = [[14.6, 4], [14.6, 4], [5.5, 4], [5.5, 4], [5.5, 4], [5.5, 4]];
    const g = must(layoutViews(six, ['row', 'stack', 'grid']));
    expect([g.arrangement, g.paper]).toEqual(['grid', 'A3']);
    expect(g.mmPerM).toBeGreaterThan(must(layoutViews(six, ['row', 'stack'])).mmPerM);
    for (const q of g.rects) {
      expect(q.x).toBeGreaterThanOrEqual(10); expect(q.y).toBeGreaterThanOrEqual(22);
      expect(q.x + q.w).toBeLessThanOrEqual(314 + 1e-6); expect(q.y + q.h).toBeLessThanOrEqual(245 + 1e-6);
    }
  });
  it('grid: row-major in the given order; a row shares y and a column shares x', () => {
    const g = must(layoutViews([[14.6, 4], [14.6, 4], [5.5, 4], [5.5, 4], [5.5, 4], [5.5, 4]], ['row', 'stack', 'grid']));
    const r6 = (v: number): number => Math.round(v * 1e6) / 1e6;
    const colXs = [...new Set(g.rects.map((q) => r6(q.x)))].sort((a, b) => a - b);
    const rowYs = [...new Set(g.rects.map((q) => r6(q.y)))].sort((a, b) => a - b);
    expect([colXs.length, rowYs.length]).toEqual([2, 3]);   // 6 views: 2 columns x 3 rows
    g.rects.forEach((q, i) => {
      expect(r6(q.x)).toBe(colXs[i % colXs.length]);
      expect(r6(q.y)).toBe(rowYs[Math.floor(i / colXs.length)]);
    });
  });
  it('grid: not a candidate with 3 views or fewer', () => {
    expect(must(layoutViews([[14.6, 4], [5.5, 4], [5.5, 4]], ['row', 'stack', 'grid'])).arrangement).not.toBe('grid');
  });
  it('a stack of 20: the available width is negative (s<0), so no layout fits and the result is null', () => {
    // Picking the smallest scale (A1 1:1000) anyway would "draw" it with a 292 mm block in a 223 mm drawing area, overflowing 34.5 mm at top and bottom.
    // A layout that does not fit is never chosen.
    const extents: Array<[number, number]> = Array.from({ length: 20 }, (): [number, number] => [10, 1]);
    expect(layoutViews(extents, ['stack'])).toBeNull();
  });

  // ---- Layouts that leave the drawing area are not chosen ----

  it('when scales tie at the end of the ladder the layout that fits is chosen: grid, not row', () => {
    // By hand (continuous mm/m): row 0.279, stack 0.4025, grid 0.5917; all three fall to A1 1:1000 (0.5 mm/m).
    // "The first given layout wins a tie" would pick row and overflow the drawing area by 100 mm.
    const r = must(layoutViews([[450, 100], [30, 100], [450, 100], [30, 100]], ['row', 'stack', 'grid']));
    expect([r.arrangement, r.paper, r.fits]).toEqual(['grid', 'A1', true]);
    for (const q of r.rects) expect(insideMain(q)).toBe(true);
  });

  it('gives null when no layout fits one sheet', () => {
    expect(layoutViews([[685, 10]], ['single'])).toBeNull();
    expect(layoutViews([[685, 10], [685, 10]], ['row', 'stack', 'grid'])).toBeNull();
  });

  it('2,000 seeded random cases: whenever non-null the result is inside the drawing area and placement is within 0-1', () => {
    // LCG: every run sees the same inputs (a regression net).
    let s = 12345 >>> 0;
    const rnd = (): number => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 2 ** 32;
    };
    let nulls = 0;
    let fitted = 0;
    for (let i = 0; i < 2000; i++) {
      const n = 1 + Math.floor(rnd() * 6);
      const extents: Array<[number, number]> = Array.from({ length: n }, (): [number, number] => [
        0.5 + rnd() * 1999.5,
        0.5 + rnd() * 1999.5,
      ]);
      const arrangements: Arrangement[] = n === 1 ? ['single'] : ['row', 'stack', 'grid'];
      const r = layoutViews(extents, arrangements);
      if (r === null) {
        nulls++;
        continue;
      }
      fitted++;
      expect(r.fits).toBe(true);
      for (const q of r.rects) {
        if (!insideMain(q)) throw new Error(`outside the drawing area #${i} ${r.arrangement} ${JSON.stringify(q)}`);
      }
      for (const [px, py, pw, ph] of r.placements) {
        if (!(px >= 0 && py >= 0 && px + pw <= 1 + 1e-5 && py + ph <= 1 + 1e-5)) {
          throw new Error(`placement outside 0-1 #${i} ${JSON.stringify([px, py, pw, ph])}`);
        }
      }
    }
    // Were both branches really exercised; with only one of them this test would guard nothing.
    expect(nulls).toBeGreaterThan(0);
    expect(fitted).toBeGreaterThan(0);
  });

  it('FRAME equals the frame template metrics (frame_bw_meta.json)', () => {
    const meta = JSON.parse(readFileSync('public/proposal/frame_bw_meta.json', 'utf8')) as {
      canvas_mm: number[];
      main_area_mm: number[];
    };
    expect([...FRAME.main]).toEqual(meta.main_area_mm);
    expect([...FRAME.canvasA3]).toEqual(meta.canvas_mm);
  });
});
