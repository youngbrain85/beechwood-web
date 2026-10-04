// ------------------------------------------------------------------
//  Sheet viewer overlay (AashtoSheetMarks): geometry that follows the paper scale (A3, A1).
//  An A1 sheet is the A3 layout scaled by 2 as a whole (pipeline wrap_a1), so the table fill, the defect glyphs and
//  the numbered callouts must all use the same scale for their size relative to the sheet to be the same on every paper.
//  Checked: row 1 text lies inside row 1 of the printed table (A3 x 318-412, y 34.5-39.1 / A1 x 636-824, y 69-78.2),
//  and the text size, glyph width and callouts follow the scale.
// ------------------------------------------------------------------
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AashtoDamageRow } from './rows';
import { AashtoSheetMarks, type SheetMarkItem } from './SheetMarks';

const ROW: AashtoDamageRow = {
  id: 'd-rail',
  no: 1,
  objectId: 'o-rail',
  objectCode: 'BW_RAIL_R',
  sheetId: 's-rail',
  elementNo: 331,
  elementName: 'Reinforced Concrete Bridge Railing',
  category: 'other',
  defectNo: 1190,
  defectName: 'Abrasion/Wear (PSC/RC)',
  cs: 2,
  qty: 20,
  unit: 'ft',
  notes: 'Traffic face, Span B',
  observedAt: null,
  round: '2026-09',
};

/* One point damage; the box is in canvas mm (same shape as Dashboard overlayItems) */
const item = (cx: number, cy: number): SheetMarkItem => ({
  key: 'd-rail',
  no: 1,
  kind: 'point',
  pts: [[cx, cy]],
  closed: false,
  box: { x: cx - 2.45, y: cy - 2.45, w: 4.9, h: 4.9 },
});

const render = (cw: number, ch: number, it: SheetMarkItem): string =>
  renderToStaticMarkup(
    createElement('svg', { viewBox: `0 0 ${cw} ${ch}` }, createElement(AashtoSheetMarks, { overlay: [it], rows: [ROW], cw, ch, fontMm: 2 })),
  );

/* Table cell text (data-el-cell): x, y, font size */
function cells(html: string): Array<{ x: number; y: number; size: number; text: string }> {
  return [...html.matchAll(/<text[^>]*data-el-cell="[^"]*"[^>]*>([^<]*)<\/text>/g)].map((m) => {
    const tag = m[0];
    const num = (a: string): number => Number(new RegExp(` ${a}="([0-9.]+)"`).exec(tag)![1]);
    return { x: num('x'), y: num('y'), size: num('font-size'), text: m[1]! };
  });
}

describe('AashtoSheetMarks — A3(420×297)', () => {
  const html = render(420, 297, item(150, 120));

  it('the seven cells of row 1 lie inside row 1 of the printed table (x 318-412, y 34.5-39.1), text 2 mm', () => {
    const c = cells(html);
    // Characters per cell = floor(cell width / (0.55 x font size)); on overflow one fewer plus an ellipsis (trailing spaces trimmed)
    expect(c.map((x) => x.text)).toEqual(['1', '331 Reinforced Conc…', '1190 Abrasion/Wear…', 'CS2', '20', 'ft', 'Traffic face…']);
    for (const x of c) {
      expect(x.x).toBeGreaterThan(318);
      expect(x.x).toBeLessThan(412);
      expect(x.y).toBeGreaterThan(34.5);
      expect(x.y).toBeLessThan(39.1);
      expect(x.size).toBe(2);
    }
  });

  it('defect glyph is 7 mm wide and centered on the damage; the callout is unscaled', () => {
    expect(html).toMatch(/<svg x="146.5" y="[\d.]+" width="7"[^>]*data-symbol="abrasion"/);
    expect(html).not.toContain('transform="scale(');
  });
});

describe('AashtoSheetMarks: A1 (841x594, the A3 layout x 2)', () => {
  const html = render(841, 594, item(300, 240));

  it('row 1 text lies inside row 1 of the A1 printed table (x 636-824, y 69-78.2), text 4 mm, and never in the title band (y < 38)', () => {
    const c = cells(html);
    expect(c).toHaveLength(7);
    for (const x of c) {
      expect(x.x).toBeGreaterThan(636);
      expect(x.x).toBeLessThan(824);
      expect(x.y).toBeGreaterThan(69);
      expect(x.y).toBeLessThan(78.2);
      expect(x.size).toBe(4);
    }
    // Cells are twice as wide, so the text is cut at the same length as on A3 (same size relative to the sheet)
    expect(c.map((x) => x.text)).toEqual(['1', '331 Reinforced Conc…', '1190 Abrasion/Wear…', 'CS2', '20', 'ft', 'Traffic face…']);
  });

  it('defect glyph is 14 mm wide (centered on the damage); the numbered callout is drawn in A3 units under scale(2)', () => {
    expect(html).toMatch(/<svg x="293" y="[\d.]+" width="14"[^>]*data-symbol="abrasion"/);
    expect(html).toContain('transform="scale(2)"');
  });
});
