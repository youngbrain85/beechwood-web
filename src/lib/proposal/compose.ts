// ------------------------------------------------------------------
//  Preview composition: frame template + the engine's drawing fragment give the SVG of one sheet.
//
//  A template (public/proposal/frame_*.svg) is a static asset produced once by the frame
//  function of the pipeline's sheet generator.
//  The frame kind and template path are decided by the bridge profile (src/bridge: frames.kindFor, frames.templates).
//  The KEY PLAN coordinate system is stored in the frame metrics file under the kind's name.
//  The texts that differ per sheet — title · view labels · scale — are not in the template; they are
//  laid over it here. View labels are shown as stored (ViewSpec.label).
//
//  Coordinates: everything is composed in A3 coordinates (420x297). For A1 the same picture is
//  scaled as a whole by scale(2) onto an 841x594 canvas, because the relative size of the frame
//  elements must not change with the paper.
//  ViewSpec.placement is already relative to the final canvas (0-1), so for A1 it is divided by 2
//  to get back to A3 coordinates (the layout.ts convention).
// ------------------------------------------------------------------
import type { ProposalSpec } from './engine';
import type { Vec3 } from './types';

/**
 * Coordinate system of a band KEY PLAN: a schematic elevation (no height information), e.g. kind bw
 * (the bw entry of the pipeline's mangdo/frame_bw_meta.json, which also carries ground_y).
 */
export interface KeyplanBand {
  kp_box: [number, number, number, number];
  padx: number;
  z: [number, number];
  band_y: [number, number];
}

/* Frame metrics generated together with a template: the coordinate system of the KEY PLAN hatch,
 *  stored under the name of the frame kind (e.g. bw). */
export interface FrameMeta {
  canvas_mm: [number, number];
  main_area_mm: [number, number, number, number];
  [kind: string]: unknown;
}

/**
 * Frame kind: the name returned by frames.kindFor of the bridge profile (a key of templates).
 * Its KEY PLAN is a band on a schematic elevation.
 */
export type FrameKind = string;

/* Font stack. The template's `Pretendard` is not the name the app actually ships (theme.ts uses
 *  `'Pretendard Variable'`), so on screen it would fall back to a serif. Fallbacks are added so the result
 *  also opens outside the viewer (a downloaded SVG), and the composed result always carries this stack only. */
const FONT_STACK = "'Pretendard Variable', Pretendard, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
/* Hatch: the values the generator's KEY PLAN drawing uses (hatch_rect step=1.8, lw=0.18). */
const HATCH_STEP = 1.8;
const HATCH_LW = 0.18;
/* Minimum hatch size, so a short or thin range does not vanish into a single line (mm). */
const HATCH_MIN_W = 0.8;

function f2(x: number): string {
  return (Math.round(x * 100) / 100).toFixed(2);
}

/* The generator's esc() + quotes: the title goes into text content, not an attribute, but it is user input. */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* Same form as the generator's SVG.text, so the added text looks like one piece with the template text. */
function text(
  x: number,
  y: number,
  s: string,
  size: number,
  opts: { anchor?: string; weight?: string; fill?: string } = {},
): string {
  const { anchor = 'start', weight = 'normal', fill = '#000' } = opts;
  return `<text x="${f2(x)}" y="${f2(y)}" font-family="Pretendard" font-size="${f2(size)}"`
    + ` text-anchor="${anchor}" font-weight="${weight}" fill="${fill}">${esc(s)}</text>`;
}

/* Same shape as the generator's hatch_rect: outer rectangle + 45-degree diagonals.
 *  (The generator's `x1 >= x and x2 <= x+w` guard is always true because n = int((w+h)/step), so it is omitted.) */
function hatchRect(x: number, y: number, w: number, h: number): string {
  const out = [`<rect x="${f2(x)}" y="${f2(y)}" width="${f2(w)}" height="${f2(h)}"`
    + ` fill="none" stroke="#000" stroke-width="${f2(HATCH_LW)}"/>`];
  const n = Math.floor((w + h) / HATCH_STEP);
  for (let i = 1; i <= n; i++) {
    const t = i * HATCH_STEP;
    const x1 = t <= w ? x + t : x + w;
    const y1 = t <= w ? y : y + t - w;
    const x2 = t <= h ? x : x + t - h;
    const y2 = t <= h ? y + t : y + h;
    out.push(`<line x1="${f2(x1)}" y1="${f2(y1)}" x2="${f2(x2)}" y2="${f2(y2)}"`
      + ` stroke="#000" stroke-width="${f2(HATCH_LW)}"/>`);
  }
  return out.join('');
}

/* One band on paper to [start, size]. It is fitted into the box [lo,hi] first, and if too thin it is then
 *  widened to min on both sides **in place** (keeping its center).
 *  Fitting comes first because the minimum-size correction must come last: that way the band's center,
 *  i.e. the real position of the selection, is not moved by it. A correction slightly past the margin line is still inside the cell and not hidden. */
function band(start: number, size: number, min: number, lo: number, hi: number): [number, number] {
  const n = Math.min(size, hi - lo);               // larger than the box: fit to the box
  const s = Math.min(Math.max(start, lo), hi - n); // push inside the box
  return n >= min ? [s, n] : [s + n / 2 - min / 2, min];
}

/* The band KEY PLAN of a kind in the frame metrics (an entry with band_y); null when absent. */
function bandOf(meta: FrameMeta, kind: FrameKind): KeyplanBand | null {
  const k: unknown = meta[kind];
  return typeof k === 'object' && k !== null && 'band_y' in k ? (k as KeyplanBand) : null;
}

/* Selection range to the KEY PLAN hatch rectangle (A3 coordinates, mm). The hatch always sits at the real position of the selection. */
function keyplanHatch(meta: FrameMeta, kind: FrameKind, bounds: { min: Vec3; max: Vec3 }): string {
  const [z0, z1] = [bounds.min[2], bounds.max[2]];

  // For a kind missing from the frame metrics the hatch is left out and composing continues.
  const kp = bandOf(meta, kind);
  if (!kp) return '';
  // A schematic-elevation KEY PLAN has no height information; the hatch sits on the deck band at a fixed height.
  const [kx, , kw] = kp.kp_box;
  const { padx, z, band_y } = kp;
  const sx = (kw - 2 * padx) / (z[1] - z[0]);
  const [hx, hw] = band(kx + padx + (z0 - z[0]) * sx, (z1 - z0) * sx, HATCH_MIN_W, kx + padx, kx + kw - padx);
  return hatchRect(hx, band_y[0] - 2, hw, band_y[1] - band_y[0] + 4);
}

// ------------------------------------------------------------------
//  Spec validation: for what is read from the database (sheet_proposals.spec), before composing.
//
//  Why: the composed result goes into dangerouslySetInnerHTML, and with a row-level policy granting every signed-in user
//  full access the row may not be ours. Numbers go through f2() and text through esc(), but the shape is checked
//  **before that**: escaping stops markup injection, yet a wrongly shaped value makes composing throw
//  (`.replace` on a non-string `layout.scale`, or a dereference of a missing `zone`, is a TypeError
//  that blanks the whole screen).
//  Only what composeSheetSvg actually reads is checked (other fields do not matter to composing).
// ------------------------------------------------------------------

/* 1:50, 1:1000, 1:12.5: the scale notation of the generator's layout info. */
const SCALE_RE = /^1:\d+(\.\d+)?$/;

const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/* Is it an array of n finite numbers. */
function numArray(v: unknown, n: number): boolean {
  return Array.isArray(v) && v.length === n && v.every(isFiniteNum);
}

const asRecord = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

/* How many views can be composed at most; the engine emits about six. A cap against absurd arrays. */
const MAX_VIEWS = 64;

/* Can this value be passed to composeSheetSvg as is. */
export function isComposableSpec(spec: unknown): spec is ProposalSpec {
  const s = asRecord(spec);
  if (!s) return false;

  if (!numArray(s.canvas_mm, 2)) return false;

  const layout = asRecord(s.layout);
  if (!layout || typeof layout.scale !== 'string' || !SCALE_RE.test(layout.scale)) return false;

  const bounds = asRecord(asRecord(s.zone)?.bounds);
  if (!bounds || !numArray(bounds.min, 3) || !numArray(bounds.max, 3)) return false;

  const views = s.views;
  if (!Array.isArray(views) || views.length < 1 || views.length > MAX_VIEWS) return false;
  for (const raw of views) {
    const v = asRecord(raw);
    if (!v || typeof v.label !== 'string' || !numArray(v.placement, 4)) return false;
  }
  return true;
}

export interface ComposeInput {
  template: string;
  meta: FrameMeta;
  kind: FrameKind;
  spec: ProposalSpec;
  drawing: string;
  title: string;
  /* Mark that says this is a proposal, so it is not mistaken for a confirmed sheet. */
  mark: string;
}

/* Frame template + drawing fragment + text give the finished SVG of one sheet. */
export function composeSheetSvg(a: ComposeInput): string {
  const [cw, ch] = a.spec.canvas_mm;
  const isA1 = cw > 500;
  const k = isA1 ? 2 : 1; // placement is relative to the final canvas; the factor that brings it back to A3 coordinates

  // The outer <svg> shell of the template is removed and only the inside is used; the canvas is wrapped anew for the paper.
  const open = a.template.indexOf('<svg');
  const inner = a.template.slice(a.template.indexOf('>', open) + 1, a.template.lastIndexOf('</svg>'));

  const parts = [inner, a.drawing];

  // View label: inside the label band, just above the top-left corner of the view.
  for (const v of a.spec.views) {
    const [px, py] = v.placement;
    parts.push(text((px * cw) / k, (py * ch) / k - 2.0, v.label, 3.2, { weight: 'bold' }));
  }

  parts.push(text(73, 14.0, 'ID : ' + a.title, 4.6, { weight: 'bold' }));
  parts.push(text(16, 241, 'SCALE ' + a.spec.layout.scale.replace(':', ' : '), 3.2, { weight: 'bold' }));
  parts.push(text(308, 30, a.mark, 4.2, { anchor: 'end', fill: '#C0392B' }));
  parts.push(`<g data-role="keyplan-hatch">${keyplanHatch(a.meta, a.kind, a.spec.zone.bounds)}</g>`);

  const body = parts.join('\n');
  const head = '<svg xmlns="http://www.w3.org/2000/svg"';
  const out = isA1
    ? `${head} width="841mm" height="594mm" viewBox="0 0 841 594">`
      + '<rect x="0" y="0" width="841" height="594" fill="#fff"/>'
      + `<g transform="scale(2)">\n${body}\n</g></svg>`
    : `${head} width="420mm" height="297mm" viewBox="0 0 420 297">\n${body}\n</svg>`;

  return out.replaceAll('font-family="Pretendard"', `font-family="${FONT_STACK}"`);
}
