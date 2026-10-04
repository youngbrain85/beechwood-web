// ------------------------------------------------------------------
//  Element condition table: element, unit, total, CS1-CS4 quantity and %, worst defects.
//  Rows are v_element_condition (the view sums per element), grouped by component category (deck, super, sub, other)
//  with the computed rating (v_nbi_components) on each group heading. The compact version (dashboard) has a CS bar + worst CS.
// ------------------------------------------------------------------
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MantineProvider } from '@mantine/core';
import { describe, expect, it } from 'vitest';
import type { WorstDefect } from '@/lib/eval/aashto';
import type { ElementConditionRow } from '@/types/db';
import { theme } from '@/theme';
import { CsBadge, CsBar, worstCsOf } from './cs';
import { ElementConditionTable } from './ElementConditionTable';

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

/* The 10 fixture rows of v_element_condition (with the 6 seeded damages; rating = the element's own ladder rating) */
const ROWS: ElementConditionRow[] = [
  { element_no: 12, name: 'Reinforced Concrete Deck', unit: 'sq ft', category: 'deck', total_qty: 8316, cs1: 8304, cs2: 12, cs3: 0, cs4: 0, rating: 8 },
  { element_no: 109, name: 'Prestressed Concrete Open Girder/Beam', unit: 'ft', category: 'super', total_qty: 1000, cs1: 996, cs2: 0, cs3: 4, cs4: 0, rating: 6 },
  { element_no: 205, name: 'Reinforced Concrete Column', unit: 'each', category: 'sub', total_qty: 4, cs1: 4, cs2: 0, cs3: 0, cs4: 0, rating: 9 },
  { element_no: 210, name: 'Reinforced Concrete Pier Wall', unit: 'ft', category: 'sub', total_qty: 44, cs1: 44, cs2: 0, cs3: 0, cs4: 0, rating: 9 },
  { element_no: 215, name: 'Reinforced Concrete Abutment', unit: 'ft', category: 'sub', total_qty: 70.34, cs1: 67.34, cs2: 3, cs3: 0, cs4: 0, rating: 8 },
  { element_no: 234, name: 'Reinforced Concrete Pier Cap', unit: 'ft', category: 'sub', total_qty: 66, cs1: 60, cs2: 6, cs3: 0, cs4: 0, rating: 8 },
  { element_no: 301, name: 'Pourable Joint Seal', unit: 'ft', category: 'other', total_qty: 66, cs1: 66, cs2: 0, cs3: 0, cs4: 0, rating: 9 },
  { element_no: 310, name: 'Elastomeric Bearing', unit: 'each', category: 'super', total_qty: 24, cs1: 23, cs2: 0, cs3: 1, cs4: 0, rating: 6 },
  { element_no: 321, name: 'Reinforced Concrete Approach Slab', unit: 'sq ft', category: 'other', total_qty: 1230, cs1: 1230, cs2: 0, cs3: 0, cs4: 0, rating: 9 },
  { element_no: 331, name: 'Reinforced Concrete Bridge Railing', unit: 'ft', category: 'other', total_qty: 504, cs1: 484, cs2: 20, cs3: 0, cs4: 0, rating: 8 },
];
const WORST = new Map<number, WorstDefect[]>([
  [12, [{ defectNo: 1130, cs: 2, quantity: 12 }]],
  [109, [{ defectNo: 1080, cs: 3, quantity: 4 }]],
  [310, [{ defectNo: 2230, cs: 3, quantity: 1 }]],
]);
const RATINGS = { deck: 8, super: 6, sub: 8 };

describe('worstCsOf: worst CS of a row (the worst state that has quantity)', () => {
  it('is 3 when CS3 has quantity and 1 when CS2-4 are empty', () => {
    expect(worstCsOf(ROWS[1]!)).toBe(3);
    expect(worstCsOf(ROWS[0]!)).toBe(2);
    expect(worstCsOf(ROWS[2]!)).toBe(1);
  });
});

describe('CsBadge · CsBar', () => {
  it('CS badge: text CSn, CS color background, ink text on CS2 and CS3 (contrast)', () => {
    const b3 = markup(createElement(CsBadge, { cs: 3 }));
    expect(text(b3)).toBe('CS3');
    expect(b3).toContain('#EF6C00');
    expect(markup(createElement(CsBadge, { cs: 1 }))).toContain('#2E7D32');
    expect(text(markup(createElement(CsBadge, { cs: null })))).toBe('—');
  });

  it('CS bar: the four segment widths follow the quantity shares, with % in the title', () => {
    const html = markup(createElement(CsBar, { cs: [996, 0, 4, 0], total: 1000 }));
    expect(html).toContain('width:99.6%');
    expect(html).toContain('width:0.4%');
    expect(html).toContain('CS1 99.6% · CS2 0% · CS3 0.4% · CS4 0%');
  });
});

describe('ElementConditionTable: full version (analysis)', () => {
  const html = markup(createElement(ElementConditionTable, { rows: ROWS, worstDefects: WORST, ratings: RATINGS }));
  const t = text(html);

  it('header: Element, Unit, Total Qty, CS1-CS4, Rating, Worst Defects', () => {
    expect(t).toContain('Element Unit Total Qty CS1 CS2 CS3 CS4 Rating Worst Defects');
  });

  it('groups in the order deck, super, sub, other, with the computed rating on the heading (N/A for other)', () => {
    const i = (s: string) => t.indexOf(s);
    expect(i('Deck — Computed rating 8 · Very Good')).toBeGreaterThan(-1);
    expect(i('Superstructure — Computed rating 6 · Satisfactory')).toBeGreaterThan(i('Deck —'));
    expect(i('Substructure — Computed rating 8 · Very Good')).toBeGreaterThan(i('Superstructure —'));
    expect(i('Other — Not rated (N/A)')).toBeGreaterThan(i('Substructure —'));
  });

  it('element row: number, name, unit, total, CS quantity and %', () => {
    expect(t).toContain('109 Prestressed Concrete Open Girder/Beam ft 1,000 996 99.6% 0 0% 4 0.4% 0 0%');
    expect(t).toContain('215 Reinforced Concrete Abutment ft 70.34 67.34 95.7% 3 4.3%');
  });

  it('worst defects: defect number, name and CS badge; a notice for an element with no defect', () => {
    expect(t).toContain('1080 Delamination/Spall/Patched Area CS3');
    expect(t).toContain('2230 Bulging, Splitting or Tearing CS3');
    expect(t).toContain('205 Reinforced Concrete Column each 4 4 100% 0 0% 0 0% 0 0% 9 Excellent No defects recorded');
  });

  it('bearings (310) sit in the super group: the category follows the view', () => {
    expect(t.indexOf('310 Elastomeric Bearing')).toBeGreaterThan(t.indexOf('Superstructure —'));
    expect(t.indexOf('310 Elastomeric Bearing')).toBeLessThan(t.indexOf('Substructure —'));
  });

  // ------------------------------------------------------------------
  //  Element rating: v_element_condition.rating (the element's own ladder rating). A component rating is the minimum
  //  of its elements' ratings, so the table must show which element set it: that element's rating cell is bold.
  // ------------------------------------------------------------------
  /* Markup of one element row (a single <tr>) */
  const rowHtml = (no: number): string => html.split('<tr').find((r) => r.includes(`>${no} `)) ?? '';

  it('shows the rating and NBI descriptor per element, after the CS cells and before Worst Defects', () => {
    expect(t).toContain('109 Prestressed Concrete Open Girder/Beam ft 1,000 996 99.6% 0 0% 4 0.4% 0 0% 6 Satisfactory 1080');
    expect(t).toContain('310 Elastomeric Bearing each 24 23 95.8% 0 0% 1 4.2% 0 0% 6 Satisfactory 2230');
    expect(t).toContain('12 Reinforced Concrete Deck sq ft 8,316 8,304 99.9% 12 0.1% 0 0% 0 0% 8 Very Good 1130');
    expect(t).toContain('210 Reinforced Concrete Pier Wall ft 44 44 100% 0 0% 0 0% 0 0% 9 Excellent No defects recorded');
    expect(t).toContain('331 Reinforced Concrete Bridge Railing ft 504 484 96.0% 20 4.0% 0 0% 0 0% 8 Very Good');
  });

  it('marks the elements that set the component rating (group minimum): super 109 and 310 (6), deck 12 (8), sub 215 and 234 (8)', () => {
    for (const no of [12, 109, 310, 215, 234]) expect(rowHtml(no), String(no)).toContain('data-drives-rating');
    for (const no of [205, 210]) expect(rowHtml(no), String(no)).not.toContain('data-drives-rating');
    expect(html.match(/data-drives-rating/g)).toHaveLength(5);
  });

  it('has no such mark for other elements (no component rating, N/A) or when the rating is unknown (the rating cell stays)', () => {
    for (const no of [301, 321, 331]) expect(rowHtml(no), String(no)).not.toContain('data-drives-rating');
    const noRatings = markup(createElement(ElementConditionTable, { rows: ROWS, worstDefects: WORST }));
    expect(noRatings).not.toContain('data-drives-rating');
    expect(text(noRatings)).toContain('109 Prestressed Concrete Open Girder/Beam ft 1,000 996 99.6% 0 0% 4 0.4% 0 0% 6 Satisfactory');
  });

  it('group heading rows span the whole table (9 columns)', () => {
    // The React server renderer writes the attribute as colSpan (HTML attributes are case-insensitive)
    expect(html.match(/colspan="\d+"/gi)).toEqual(Array(4).fill('colSpan="9"'));
  });
});

describe('ElementConditionTable: compact version (dashboard)', () => {
  it('element, total, CS bar, worst CS badge', () => {
    const html = markup(createElement(ElementConditionTable, { rows: ROWS, variant: 'compact' }));
    const t = text(html);
    expect(t).toContain('Element Total Qty Condition Worst');
    expect(t).toContain('109 Prestressed Concrete Open Girder/Beam 1,000 ft CS3');
    expect(html.match(/data-cs-bar="/g)).toHaveLength(10);
  });

  it('with no rows renders the header only; loading and empty notices belong to the caller', () => {
    const t = text(markup(createElement(ElementConditionTable, { rows: [], variant: 'compact' })));
    expect(t).toBe('Element Total Qty Condition Worst');
  });
});
