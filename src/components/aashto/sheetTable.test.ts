// ------------------------------------------------------------------
//  Filling the printed sheet table "ELEMENT CONDITION QUANTITIES" (sheet viewer overlay): the same geometry as the
//  pipeline's sheet frame: x 318, width 94, table head 28 + 6.5, 46 rows x 4.6 mm,
//  relative column widths EL_COLS = No. 7, Element 22, Defect 22, CS 7, Qty 12, Unit 9, Notes 15 (sum 94 = width 94, so 1:1 mm).
// ------------------------------------------------------------------
import { describe, expect, it } from 'vitest';
import { SQtyCols } from '@/i18n/s.eval';
import { EL_TABLE, elCells, elColRect, elRowTop, paperScale } from './sheetTable';
import type { AashtoDamageRow } from './rows';

describe('EL_TABLE: geometry of the frame table', () => {
  it('column names and relative widths = pipeline EL_COLS; names match the on-screen table (SQtyCols)', () => {
    expect(EL_TABLE.cols).toEqual([
      ['No.', 7],
      ['Element', 22],
      ['Defect', 22],
      ['CS', 7],
      ['Qty', 12],
      ['Unit', 9],
      ['Notes', 15],
    ]);
    expect(EL_TABLE.cols.map(([n]) => n)).toEqual([...SQtyCols]);
  });

  it('table box — x 318 · width 94 · top 28 · header 6.5 · 46 rows of 4.6 mm (the printed frame)', () => {
    expect([EL_TABLE.x, EL_TABLE.w, EL_TABLE.top, EL_TABLE.headerH, EL_TABLE.rowH, EL_TABLE.maxRows]).toEqual([
      318, 94, 28, 6.5, 4.6, 46,
    ]);
    for (const r of [0, 1, 45]) expect(elRowTop(r, 1)).toBeCloseTo(28 + 6.5 + r * 4.6, 9);
  });

  it('column rectangles: widths sum to 94 = width 94 so 1:1 mm; the last column ends at the right edge of the table', () => {
    expect(elColRect(0, 1)).toEqual([318, 7]);
    expect(elColRect(1, 1)).toEqual([325, 22]);
    expect(elColRect(3, 1)).toEqual([369, 7]);
    const [x6, w6] = elColRect(6, 1);
    expect(x6 + w6).toBeCloseTo(EL_TABLE.x + EL_TABLE.w, 9);
  });
});

// ------------------------------------------------------------------
//  Paper scale: an A1 sheet (BW-RAIL-L/R, 841x594) is the A3 layout scaled as a whole by scale(2.0000) in the pipeline's wrap_a1
//  (A1_SF = 2.0). The printed table sits at twice the position too (x 636-824, row 1 y 69-78.2), so the fill text must move by the same scale.
// ------------------------------------------------------------------
describe('paperScale and scaled geometry', () => {
  it('canvas width to scale: A3 (420) 1, A1 (841) 2', () => {
    expect(paperScale(420)).toBe(1);
    expect(paperScale(841)).toBe(2);
  });

  it('A1: table left 636, right 824, row 1 69-78.2 (the scale(2) table of 21_BW-RAIL-R.svg)', () => {
    expect(elColRect(0, 2)).toEqual([636, 14]);
    const [x6, w6] = elColRect(6, 2);
    expect(x6 + w6).toBeCloseTo(824, 9);
    expect(elRowTop(0, 2)).toBeCloseTo(69, 9);
    expect(elRowTop(1, 2)).toBeCloseTo(78.2, 9);
  });
});

describe('elCells: a row to the seven cells of the printed table', () => {
  const row: AashtoDamageRow = {
    id: 'd1',
    no: 1,
    objectId: 'o',
    objectCode: 'BW_BEAM_B2',
    sheetId: 's',
    elementNo: 109,
    elementName: 'Prestressed Concrete Open Girder/Beam',
    category: 'super',
    defectNo: 1080,
    defectName: 'Delamination/Spall/Patched Area',
    cs: 3,
    qty: 4,
    unit: 'ft',
    notes: 'West face',
    observedAt: null,
    round: '2026-09',
  };

  it('No., element (number name), defect (number name), CSn, quantity, unit, notes', () => {
    expect(elCells(row)).toEqual([
      '1',
      '109 Prestressed Concrete Open Girder/Beam',
      '1080 Delamination/Spall/Patched Area',
      'CS3',
      '4',
      'ft',
      'West face',
    ]);
  });

  it('empty values give empty cells (the printed table uses no dashes)', () => {
    expect(
      elCells({ ...row, no: null, elementNo: null, elementName: null, defectNo: null, defectName: 'Other', cs: null, qty: null, unit: null, notes: '' }),
    ).toEqual(['', '', 'Other', '', '', '', '']);
  });
});
