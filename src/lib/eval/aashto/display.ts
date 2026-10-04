// ------------------------------------------------------------------
//  AASHTO display rules (pure) — the colours, bands, filters and symbols the screens share.
//
//  - Condition state colors: CS1 green #2E7D32, CS2 yellow #F9A825, CS3 orange #EF6C00, CS4 red #C62828 (fixed values).
//    The 3D condition heatmap, the damage markers and the CS cells of tables all use this one table.
//  - NBI rating bands (SNBI Good/Fair/Poor): 7 and above Good, 5-6 Fair, 4 and below Poor, the same thresholds as
//    nbi.ts overallCondition. Band colors are borrowed from the CS palette so a screen uses one palette.
//  - Defect glyphs: the same groups and order as the printed sheet LEGEND (the 8 entries of the pipeline's sheet
//    generator). Defects without a legend glyph (bearing movement, distortion, impact damage and so on) are 'other'.
//  Display texts (names, descriptions) are not kept here; see i18n/s.eval.ts.
// ------------------------------------------------------------------
import { DEFECTS } from './defects';
import type { ConditionState, DefectDef, ElementCategory } from './types';

/* Condition state to color */
export const CS_COLOUR: Record<ConditionState, string> = {
  1: '#2E7D32',
  2: '#F9A825',
  3: '#EF6C00',
  4: '#C62828',
};

export function csColour(cs: ConditionState): string {
  return CS_COLOUR[cs];
}

/* Color of objects without an AASHTO element (cross-frames, pile stubs and so on, which are not rated) */
export const NOT_RATED_COLOUR = '#BDC3C7';

/**
 * 3D selection highlight: blue. A dark red highlight would be confused with the CS4 red of the condition heatmap,
 * so this color is used (different from green, yellow, orange, red and grey; display.test.ts).
 */
export const SELECTION_COLOUR = '#2962FF';
/* Emissive of the selection highlight (so dark faces read blue too) */
export const SELECTION_EMISSIVE = '#0A1F66';

/* SNBI band of an NBI component rating (0-9) */
export type RatingBand = 'good' | 'fair' | 'poor';

export function ratingBand(rating: number): RatingBand {
  if (rating >= 7) return 'good';
  if (rating >= 5) return 'fair';
  return 'poor';
}

/* Band colors: the same values as CS1, CS2 and CS4 (written as literals so the module top level holds declarations only) */
export const BAND_COLOUR: Record<RatingBand, string> = {
  good: '#2E7D32',
  fair: '#F9A825',
  poor: '#C62828',
};

/* Defects that can occur in an element category (deck/super/sub/other), in library order (ascending number). All of them for null. */
export function defectsForCategory(category: ElementCategory | null): DefectDef[] {
  if (category === null) return DEFECTS;
  return DEFECTS.filter((d) => d.appliesTo.includes(category));
}

/* Defect glyph keys of the printed sheet LEGEND (sheet legend order) */
export type DefectSymbolKey =
  | 'crack'
  | 'spall'
  | 'rebar'
  | 'efflor'
  | 'abrasion'
  | 'corrosion'
  | 'leakage'
  | 'settlement';

/* The 8 glyphs and the defect numbers each covers. The name (legend wording) is looked up by key in s.eval.ts. */
export const DEFECT_SYMBOLS: ReadonlyArray<{ key: DefectSymbolKey; defects: readonly number[] }> = [
  { key: 'crack', defects: [1110, 1130, 3220] },
  { key: 'spall', defects: [1080, 3210, 2360] },
  { key: 'rebar', defects: [1090, 1100] },
  { key: 'efflor', defects: [1120] },
  { key: 'abrasion', defects: [1190] },
  { key: 'corrosion', defects: [1000, 1020] },
  // Expansion joint defects (leakage, seal adhesion, seal damage, metal parts, debris) form one group, so a renumbering (2340 vs 2370) keeps the glyph
  { key: 'leakage', defects: [2310, 2320, 2330, 2340, 2350, 2370] },
  { key: 'settlement', defects: [4000, 6000] },
];

/* Defect number to legend glyph ('other' when none). A linear search over 8 groups; no top-level index table is built (see the comment above). */
export function defectSymbol(defectNo: number | null | undefined): DefectSymbolKey | 'other' {
  if (defectNo == null) return 'other';
  for (const s of DEFECT_SYMBOLS) if (s.defects.includes(defectNo)) return s.key;
  return 'other';
}

/* Quantity share (0-1); 0 when the total is 0 (no division-by-zero NaN reaches the screen) */
export function share(qty: number, total: number): number {
  return total > 0 ? qty / total : 0;
}
