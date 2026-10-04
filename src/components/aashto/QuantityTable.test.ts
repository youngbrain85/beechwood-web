// ------------------------------------------------------------------
//  Element condition quantity table: the columns of the printed sheet table "ELEMENT CONDITION QUANTITIES"
//  (No./Element/Defect/CS/Qty/Unit/Notes), with group heading rows by object or by sheet. By sheet, the object code is shown small under the element (a sheet mixes objects).
// ------------------------------------------------------------------
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MantineProvider } from '@mantine/core';
import { describe, expect, it } from 'vitest';
import { SEval } from '@/i18n/s.eval';
import { theme } from '@/theme';
import { QuantityTable } from './QuantityTable';
import type { AashtoDamageRow, RowGroup } from './rows';

function markup(el: ReactNode): string {
  return renderToStaticMarkup(
    createElement(MantineProvider, { theme, withCssVariables: false, withGlobalClasses: false }, el),
  ).replace(/></g, '>\n<');
}
/* Visible text (tags removed, HTML entities restored, whitespace normalized) */
const text = (html: string): string =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

const row = (p: Partial<AashtoDamageRow>): AashtoDamageRow => ({
  id: 'd1',
  no: 1,
  objectId: 'o-beam',
  objectCode: 'BW_BEAM_B2',
  sheetId: 's1',
  elementNo: 109,
  elementName: 'Prestressed Concrete Open Girder/Beam',
  category: 'super',
  defectNo: 1080,
  defectName: 'Delamination/Spall/Patched Area',
  cs: 3,
  qty: 4,
  unit: 'ft',
  notes: 'West face, 0.25 L from Bent 2 — Demo record',
  observedAt: '2026-09-21T13:20:00+00:00',
  round: '2026-09',
  ...p,
});

describe('QuantityTable', () => {
  const groups: RowGroup[] = [
    { key: 'BW_BEAM_B2', label: 'BW_BEAM_B2', rows: [row({})] },
    {
      key: 'BW_XF_B',
      label: 'BW_XF_B',
      rows: [row({ id: 'd2', no: null, objectCode: 'BW_XF_B', elementNo: null, elementName: null, defectNo: null, defectName: 'Loose bolt', cs: null, qty: null, unit: null, notes: '' })],
    },
  ];

  it('header: the seven columns of the printed sheet', () => {
    const t = text(markup(createElement(QuantityTable, { groups })));
    expect(t.startsWith('No. Element Defect CS Qty Unit Notes')).toBe(true);
  });

  it('group heading row (label, damage count) and row cells', () => {
    const t = text(markup(createElement(QuantityTable, { groups })));
    expect(t).toContain('BW_BEAM_B2 1 damage');
    expect(t).toContain(
      '1 109 Prestressed Concrete Open Girder/Beam 1080 Delamination/Spall/Patched Area CS3 4 ft West face, 0.25 L from Bent 2 — Demo record',
    );
  });

  it('empty cells are a dash: object without an element, no defect number (stored name), no observation', () => {
    const t = text(markup(createElement(QuantityTable, { groups })));
    expect(t).toContain('BW_XF_B 1 damage — — Loose bolt — — — —');
  });

  it('a group without a sheet (label null) shows a notice; by-sheet groups show the object code under the element', () => {
    const t = text(
      markup(createElement(QuantityTable, { groups: [{ key: '—', label: null, rows: [row({ sheetId: null })] }], showObject: true })),
    );
    expect(t).toContain(`${SEval.quantities.noSheet} 1 damage`);
    expect(t).toContain('109 Prestressed Concrete Open Girder/Beam BW_BEAM_B2 1080');
  });
});

describe('QuantityTable: row expansion (optional detail)', () => {
  const groups: RowGroup[] = [{ key: 'sheet', label: 'Damages on This Sheet', rows: [row({}), row({ id: 'd2', no: 2 })] }];
  const detail = (r: AashtoDamageRow) => createElement('span', null, `detail of ${r.id}`);

  it('without a detail renderer the rows are plain: not focusable, no expanded state', () => {
    const html = markup(createElement(QuantityTable, { groups }));
    expect(html).not.toContain('aria-expanded');
    expect(html).not.toContain('tabindex');
    expect(html).not.toContain('data-damage-id');
  });

  it('with a detail renderer every row can be opened (keyboard too) and starts closed', () => {
    const html = markup(createElement(QuantityTable, { groups, detail }));
    expect(html.match(/data-damage-id="d[12]"/g)).toEqual(['data-damage-id="d1"', 'data-damage-id="d2"']);
    expect(html.match(/aria-expanded="false"/g)).toHaveLength(2);
    expect(html.match(/tabindex="0"/g)).toHaveLength(2);
    expect(html).not.toContain('data-damage-detail');
    expect(text(html)).not.toContain('detail of');
  });

  it('the opened row is followed by one detail row spanning every column', () => {
    const html = markup(createElement(QuantityTable, { groups, detail, initialExpandedId: 'd2' }));
    expect(html.match(/aria-expanded="true"/g)).toHaveLength(1);
    expect(html).toMatch(/data-damage-detail="d2"/);
    expect(html).not.toMatch(/data-damage-detail="d1"/);
    expect(html).toMatch(/colSpan="7"|colspan="7"/);
    const t = text(html);
    expect(t).toContain('detail of d2');
    expect(t).not.toContain('detail of d1');
    // the detail row comes right after its own row
    expect(html.indexOf('data-damage-detail="d2"')).toBeGreaterThan(html.indexOf('data-damage-id="d2"'));
  });
});
