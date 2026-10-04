// ------------------------------------------------------------------
//  Filling the printed sheet table "ELEMENT CONDITION QUANTITIES" of the sheet frame, for the sheet viewer overlay.
//
//  The geometry matches the table drawn by the pipeline's sheet generator:
//  x 318, width 94, table head 28 + 6.5, 46 rows x 4.6 mm. Relative column widths EL_COLS sum to 94 = width 94, so 1:1 mm.
//  On an A1 sheet the same table is twice the size (paperScale); the coordinate functions require the scale.
//  When this changes, the pipeline EL_COLS must change with it so that the text on screen keeps to the
//  printed cells (sheetTable.test.ts pins the names and widths).
// ------------------------------------------------------------------
import { SEval } from '@/i18n/s.eval';
import { defectLabel } from './cs';
import { formatQty } from './format';
import type { AashtoDamageRow } from './rows';

export const EL_TABLE = {
  x: 318,
  w: 94,
  top: 28,
  headerH: 6.5,
  rowH: 4.6,
  maxRows: 46,
  ink: '#141A1F',
  /**
   * (name, relative width), the same as the pipeline's EL_COLS (names = i18n/s.eval SQtyCols; pinned by a test).
   * Written as literals so the module has no top-level function call.
   */
  cols: [
    ['No.', 7],
    ['Element', 22],
    ['Defect', 22],
    ['CS', 7],
    ['Qty', 12],
    ['Unit', 9],
    ['Notes', 15],
  ] as Array<[string, number]>,
};

/**
 * Paper scale: sheet canvas width (mm) / A3 width 420, rounded (A3 = 1, A1 841 mm = 2).
 * An A1 sheet (BW-RAIL-L/R) is the A3 layout scaled as a whole by scale(2.0000) in the pipeline's wrap_a1 (A1_SF = 2.0), so
 * the printed table and legend sit at twice the position and size. Fill text, glyphs and callouts move by the same scale.
 * (The database zone_spec carries no paper name, so the canvas width decides.)
 */
export function paperScale(canvasW: number): number {
  return Math.max(1, Math.round(canvasW / 420));
}

/* [x, width] of column i (sheet mm); k = paperScale. A required argument so the scale cannot be forgotten. */
export function elColRect(i: number, k: number): [number, number] {
  const total = EL_TABLE.cols.reduce((s, c) => s + c[1], 0);
  const unit = (EL_TABLE.w * k) / total;
  let x = EL_TABLE.x * k;
  for (let j = 0; j < i; j++) x += EL_TABLE.cols[j]![1] * unit;
  return [x, EL_TABLE.cols[i]![1] * unit];
}

/* Top y of data row r (0-based) (sheet mm); k = paperScale */
export function elRowTop(r: number, k: number): number {
  return (EL_TABLE.top + EL_TABLE.headerH + r * EL_TABLE.rowH) * k;
}

/* A quantity row to the seven cells of the printed table (empty values give empty cells) */
export function elCells(r: AashtoDamageRow): string[] {
  return [
    r.no === null ? '' : String(r.no),
    r.elementNo === null ? '' : SEval.numbered(r.elementNo, r.elementName ?? '').trim(),
    r.defectNo === null ? r.defectName : defectLabel(r.defectNo, r.defectName),
    r.cs === null ? '' : SEval.cs(r.cs),
    r.qty === null ? '' : formatQty(r.qty),
    r.unit ?? '',
    r.notes,
  ];
}
