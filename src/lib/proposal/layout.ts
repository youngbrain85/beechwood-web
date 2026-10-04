// ------------------------------------------------------------------
//  Layout, scale, paper: places the views of one candidate sheet in the drawing area of the
//  standard inspection sheet frame. The largest round scale that fits is chosen, and when
//  it gets too small the paper goes from A3 to A1. The frame figures follow the pipeline's
//  sheet generator (its drawing-area constants, round-scale picker and layout info) exactly:
//  downstream outputs must match number for number for comparison and regression checks.
//
//  A1 is drawn in the same coordinates as A3 (a 304x223 drawing area) and then scaled as a whole
//  by 2 onto an 841x594 canvas. So the "A3-coordinate denominator" (denomA3) is always the A3-side
//  value of the real paper denominator (denomPaper), and on A1 denomA3 = 2 x denomPaper.
// ------------------------------------------------------------------
import type { Arrangement } from './compositions';

export const FRAME = {
  canvasA3: [420, 297],
  canvasA1: [841, 594],
  main: [10, 22, 304, 223],
  edge: 6,
  gap: 8,
  labelBand: 6.5,
  fillTarget: 0.85,
} as const;

/* Round scale denominators (ascending); smaller means more magnified (larger mm/m). */
export const DENOMS = [20, 25, 30, 40, 50, 60, 75, 100, 125, 150, 175, 200, 250, 300, 400, 500, 750, 1000] as const;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LayoutResult {
  arrangement: Arrangement;
  paper: 'A3' | 'A1';
  denomA3: number;
  denomPaper: number;
  mmPerM: number;
  /* Did it fit the drawing area including the label bands; a layout that does not fit is not a candidate (layoutViews). */
  fits: boolean;
  rects: Rect[];
  placements: Array<[number, number, number, number]>;
  info: {
    scale: string;
    /* The chosen layout and paper, so a sheet builder can reproduce the same drawing from the stored spec alone. */
    arrangement: Arrangement;
    paper: 'A3' | 'A1';
    main_area_mm: number[];
    views_bbox_mm: number[];
    fill_w: number;
    fill_h: number;
    fill_bbox: number;
    fill_target: number;
  };
  warnings: Array<'scale_small'>;
}

/* Rounds to n decimals, turning -0 into 0 (the same rule as spec.ts). */
function round(x: number, decimals: number): number {
  const f = 10 ** decimals;
  const r = Math.round(x * f) / f;
  return r === 0 ? 0 : r;
}

/* grid: column widths (largest in the column) and row heights (largest in the row) of a c-column grid filled row-major, in m. */
function gridShape(extents: Array<[number, number]>, cols: number): { colW: number[]; rowH: number[] } {
  const colW = new Array<number>(cols).fill(0);
  const rowH = new Array<number>(Math.ceil(extents.length / cols)).fill(0);
  extents.forEach(([w, h], i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    colW[c] = Math.max(colW[c]!, w);
    rowH[r] = Math.max(rowH[r]!, h);
  });
  return { colW, rowH };
}

/* Largest mm/m that fits a c-column grid; every row carries one label band. */
function gridScale(extents: Array<[number, number]>, cols: number): number {
  const [, , W, H] = FRAME.main;
  const { edge: e, gap: g, labelBand: band } = FRAME;
  const { colW, rowH } = gridShape(extents, cols);
  const rows = rowH.length;
  return Math.min(
    (W - 2 * e - (cols - 1) * g) / colW.reduce((s, w) => s + w, 0),
    (H - 2 * e - rows * band - (rows - 1) * g) / rowH.reduce((s, h) => s + h, 0),
  );
}

/* Tries every column count 2 ... ceil(n/2) and keeps the one with the largest scale (the smaller count on a tie).
 *  Only called with 4 or more views (layoutViews filters); for n<4 there is no candidate column count. */
function bestGridCols(extents: Array<[number, number]>): number {
  let best = 2;
  let bestScale = -Infinity;
  for (let c = 2; c <= Math.ceil(extents.length / 2); c++) {
    const s = gridScale(extents, c);
    if (s > bestScale) {
      bestScale = s;
      best = c;
    }
  }
  return best;
}

/* Largest mm/m that fits, per layout: the continuous value before a round denominator is picked. */
function availableScale(extents: Array<[number, number]>, arrangement: Arrangement): number {
  const [, , W, H] = FRAME.main;
  const { edge: e, gap: g, labelBand: band } = FRAME;
  const n = extents.length;

  if (arrangement === 'three_view') {
    const [plan, front, side] = extents as [[number, number], [number, number], [number, number]];
    const c1 = Math.max(plan[0], front[0]);
    const c2 = side[0];
    const r1 = plan[1];
    const r2 = Math.max(front[1], side[1]);
    return Math.min((W - 2 * e - g) / (c1 + c2), (H - 2 * e - 2 * band - g) / (r1 + r2));
  }

  if (arrangement === 'stack') {
    const maxW = Math.max(...extents.map(([w]) => w));
    const sumH = extents.reduce((sum, [, h]) => sum + h, 0);
    return Math.min((W - 2 * e) / maxW, (H - 2 * e - n * band - (n - 1) * g) / sumH);
  }

  if (arrangement === 'grid') return gridScale(extents, bestGridCols(extents));

  // 'single' | 'row': single is a row of one view (with n=1 the gap term is 0).
  const sumW = extents.reduce((sum, [w]) => sum + w, 0);
  const maxH = Math.max(...extents.map(([, h]) => h));
  return Math.min((W - 2 * e - (n - 1) * g) / sumW, (H - 2 * e - band) / maxH);
}

/* When s (mm/m) is 0 or less or abnormal (NaN, Infinity) the views do not fit the drawing area at all,
 *  so the safe choice is the smallest scale (largest denominator). A negative `500/s` would invert the
 *  ">=" comparison of the two denominator pickers and select the minimum (the largest scale); this prevents that. */
function isUsableScale(s: number): boolean {
  return Number.isFinite(s) && s > 0;
}

/* A3-coordinate denominator d: the smallest (most magnified) round denominator that fits within s (mm/m). 1000 when none. */
function pickA3Denom(s: number): number {
  if (!isUsableScale(s)) return 1000;
  for (const d of DENOMS) {
    if (1000 / d <= s + 1e-9) return d;
  }
  return 1000;
}

/* A1 paper denominator p: the smallest p whose 2p (A3-coordinate denominator) satisfies the same s. 1000 when none. */
function pickA1PaperDenom(s: number): number {
  if (!isUsableScale(s)) return 1000;
  for (const p of DENOMS) {
    if (p + 1e-9 >= 500 / s) return p;
  }
  return 1000;
}

/* row (side by side) and single (one view): every view's band starts at the same y, stepping sideways by gap. */
function placeRow(extents: Array<[number, number]>, mmPerM: number): Rect[] {
  const { gap: g, labelBand: band, main } = FRAME;
  const [mx, my, mw, mh] = main;
  const wMm = extents.map(([w]) => w * mmPerM);
  const hMm = extents.map(([, h]) => h * mmPerM);
  const blockW = wMm.reduce((s, w) => s + w, 0) + (extents.length - 1) * g;
  const blockH = band + Math.max(...hMm);
  const blockX = mx + (mw - blockW) / 2;
  const blockY = my + (mh - blockH) / 2;

  const rects: Rect[] = [];
  let x = blockX;
  for (let i = 0; i < extents.length; i++) {
    const w = wMm[i]!;
    const h = hMm[i]!;
    rects.push({ x, y: blockY + band, w, h });
    x += w + g;
  }
  return rects;
}

/* stack (vertical): left-aligned, each view under its own band, stepping down by gap. */
function placeStack(extents: Array<[number, number]>, mmPerM: number): Rect[] {
  const { gap: g, labelBand: band, main } = FRAME;
  const [mx, my, mw, mh] = main;
  const wMm = extents.map(([w]) => w * mmPerM);
  const hMm = extents.map(([, h]) => h * mmPerM);
  const n = extents.length;
  const blockW = Math.max(...wMm);
  const blockH = n * band + hMm.reduce((s, h) => s + h, 0) + (n - 1) * g;
  const blockX = mx + (mw - blockW) / 2;
  const blockY = my + (mh - blockH) / 2;

  const rects: Rect[] = [];
  let y = blockY;
  for (let i = 0; i < n; i++) {
    y += band;
    const w = wMm[i]!;
    const h = hMm[i]!;
    rects.push({ x: blockX, y, w, h });
    y += h + g;
  }
  return rects;
}

/* grid: filled row-major in the given order. A rectangle sits at the top left of its cell,
 *  the label band above the cell, and the whole block is centered in the drawing area. */
function placeGrid(extents: Array<[number, number]>, mmPerM: number): Rect[] {
  const { gap: g, labelBand: band, main } = FRAME;
  const [mx, my, mw, mh] = main;
  const cols = bestGridCols(extents);
  const { colW, rowH } = gridShape(extents, cols);
  const colMm = colW.map((w) => w * mmPerM);
  const rowMm = rowH.map((h) => h * mmPerM);

  const blockW = colMm.reduce((s, w) => s + w, 0) + (cols - 1) * g;
  const blockH = rowMm.length * band + rowMm.reduce((s, h) => s + h, 0) + (rowMm.length - 1) * g;
  const blockX = mx + (mw - blockW) / 2;
  const blockY = my + (mh - blockH) / 2;

  // Top left of the cell: columns accumulate width+gap and rows accumulate band+height+gap from the start.
  const cellX = colMm.map((_, i) => blockX + colMm.slice(0, i).reduce((s, w) => s + w + g, 0));
  const cellY = rowMm.map((_, i) => blockY + rowMm.slice(0, i).reduce((s, h) => s + band + h + g, 0));

  return extents.map(([w, h], i) => ({
    x: cellX[i % cols]!,
    y: cellY[Math.floor(i / cols)]! + band,
    w: w * mmPerM,
    h: h * mmPerM,
  }));
}

/* three_view: a 2x2 grid with only the top right empty: plan top left, front bottom left, side bottom right (same y as the front). */
function placeThreeView(extents: Array<[number, number]>, mmPerM: number): Rect[] {
  const [plan, front, side] = extents as [[number, number], [number, number], [number, number]];
  const { gap: g, labelBand: band, main } = FRAME;
  const [mx, my, mw, mh] = main;

  const planW = plan[0] * mmPerM;
  const planH = plan[1] * mmPerM;
  const frontW = front[0] * mmPerM;
  const frontH = front[1] * mmPerM;
  const sideW = side[0] * mmPerM;
  const sideH = side[1] * mmPerM;

  const col1 = Math.max(planW, frontW);
  const col2 = sideW;
  const row1 = planH;
  const row2 = Math.max(frontH, sideH);

  const blockW = col1 + g + col2;
  const blockH = 2 * band + row1 + g + row2;
  const blockX = mx + (mw - blockW) / 2;
  const blockY = my + (mh - blockH) / 2;
  const row2Y = blockY + band + row1 + g + band; // the gap below the row1 rect, then row2's own band

  return [
    { x: blockX, y: blockY + band, w: planW, h: planH },
    { x: blockX, y: row2Y, w: frontW, h: frontH },
    { x: blockX + col1 + g, y: row2Y, w: sideW, h: sideH },
  ];
}

function placeRects(extents: Array<[number, number]>, arrangement: Arrangement, mmPerM: number): Rect[] {
  if (arrangement === 'stack') return placeStack(extents, mmPerM);
  if (arrangement === 'grid') return placeGrid(extents, mmPerM);
  if (arrangement === 'three_view') return placeThreeView(extents, mmPerM);
  return placeRow(extents, mmPerM); // 'single' | 'row'
}

/* A3 is normalized to a 420x297 canvas; A1 to an 841x594 canvas holding the same A3 coordinates drawn x2. */
function toPlacement(r: Rect, paper: 'A3' | 'A1'): [number, number, number, number] {
  const factor = paper === 'A3' ? 1 : 2;
  const [cw, ch] = paper === 'A3' ? FRAME.canvasA3 : FRAME.canvasA1;
  return [
    round((factor * r.x) / cw, 5),
    round((factor * r.y) / ch, 5),
    round((factor * r.w) / cw, 5),
    round((factor * r.h) / ch, 5),
  ];
}

/* The same keys as the generator's layout info (+ arrangement, paper); the bbox ratios (fill_w/h/bbox) are
 *  based on the unrounded values (as in the generator). */
function buildInfo(
  rects: Rect[],
  denomPaper: number,
  arrangement: Arrangement,
  paper: 'A3' | 'A1',
): LayoutResult['info'] {
  const x0 = Math.min(...rects.map((r) => r.x));
  const y0 = Math.min(...rects.map((r) => r.y));
  const x1 = Math.max(...rects.map((r) => r.x + r.w));
  const y1 = Math.max(...rects.map((r) => r.y + r.h));
  const w = x1 - x0;
  const h = y1 - y0;
  const [, , mw, mh] = FRAME.main;

  return {
    scale: `1:${denomPaper}`,
    arrangement,
    paper,
    main_area_mm: [...FRAME.main],
    views_bbox_mm: [round(x0, 1), round(y0, 1), round(w, 1), round(h, 1)],
    fill_w: round(w / mw, 3),
    fill_h: round(h / mh, 3),
    fill_bbox: round((w * h) / (mw * mh), 3),
    fill_target: FRAME.fillTarget,
  };
}

/* Layout tolerance (mm): allows rounding error only, not a real overflow. */
const FIT_TOL = 1e-6;

/* Is it inside the drawing area including the label bands; at the end of the scale ladder (1:1000) a layout can exceed the drawing area.
 *  `pick*Denom` returns 1000 when it finds no "denominator that fits" and does not prevent overflow,
 *  so the geometry is tested once more **after** all views are placed. */
function fitsMain(rects: Rect[]): boolean {
  const [mx, my, mw, mh] = FRAME.main;
  return rects.every(
    (r) =>
      Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.w) && Number.isFinite(r.h)
      && r.x >= mx - FIT_TOL
      && r.y - FRAME.labelBand >= my - FIT_TOL
      && r.x + r.w <= mx + mw + FIT_TOL
      && r.y + r.h <= my + mh + FIT_TOL,
  );
}

/* The full layout for one arrangement: scale, then paper, then placement, then coordinate normalization. */
function buildLayout(extents: Array<[number, number]>, arrangement: Arrangement): LayoutResult {
  const s = availableScale(extents, arrangement);
  const d = pickA3Denom(s);
  const warnings: Array<'scale_small'> = [];

  let paper: 'A3' | 'A1';
  let denomA3: number;
  let denomPaper: number;
  if (d <= 150) {
    paper = 'A3';
    denomA3 = d;
    denomPaper = d;
  } else {
    paper = 'A1';
    const p = pickA1PaperDenom(s);
    denomA3 = 2 * p;
    denomPaper = p;
    if (p > 250) warnings.push('scale_small');
  }

  const mmPerM = 1000 / denomA3;
  const rects = placeRects(extents, arrangement, mmPerM);
  const placements = rects.map((r) => toPlacement(r, paper));
  const info = buildInfo(rects, denomPaper, arrangement, paper);

  return { arrangement, paper, denomA3, denomPaper, mmPerM, fits: fitsMain(rects), rects, placements, info, warnings };
}

/* The fitting layout with the largest mmPerM (scale); the first given on a tie. null when none fits. */
function pickFitting(candidates: LayoutResult[]): LayoutResult | null {
  const fitting = candidates.filter((c) => c.fits);
  if (fitting.length === 0) return null;
  return fitting.reduce((best, cur) => (cur.mmPerM > best.mmPerM ? cur : best));
}

/**
 * Builds a layout per arrangement candidate and picks the one with the largest scale **among those that fit the drawing area**.
 * null when no arrangement fits: the denominator ladder (DENOMS) ends at 1:1000 and is not extended, because a
 * smaller sheet is useless. The caller (engine.ts) skips that composition.
 */
export function layoutViews(extents: Array<[number, number]>, arrangements: Arrangement[]): LayoutResult | null {
  // grid is a candidate only with 4 or more views; with 3 or fewer a 2-column grid is the same picture as row or stack.
  const usable = arrangements.filter((a) => a !== 'grid' || extents.length >= 4);
  // When grid is the only candidate but there are too few views: falls back to row, still subject to the fit test.
  if (usable.length === 0) return pickFitting([buildLayout(extents, 'row')]);
  return pickFitting(usable.map((a) => buildLayout(extents, a)));
}
