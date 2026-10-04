// ------------------------------------------------------------------
//  Defect glyphs (the 8 of the printed sheet LEGEND + defects without a glyph), the sheet viewer legend and the 3D condition heatmap legend.
// ------------------------------------------------------------------
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MantineProvider } from '@mantine/core';
import { describe, expect, it } from 'vitest';
import { SEval } from '@/i18n/s.eval';
import { DEFECT_SYMBOLS } from '@/lib/eval/aashto';
import { theme } from '@/theme';
import { CsHeatmapLegend, DefectGlyph, DefectLegend } from './legends';

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
const KEYS = [...DEFECT_SYMBOLS.map((s) => s.key), 'other'] as const;

describe('DefectGlyph: nine glyphs (same coordinates as the 8.5x5.4 mm sheet chip)', () => {
  it('one SVG per glyph, a chip border plus the glyph shape', () => {
    for (const k of KEYS) {
      const html = markup(createElement(DefectGlyph, { symbol: k }));
      expect(html.startsWith('<svg'), k).toBe(true);
      expect(html, k).toContain('viewBox="0 0 8.5 5.4"');
      expect(html, k).toContain(`data-symbol="${k}"`);
    }
  });

  it('every glyph has a different shape', () => {
    const bodies = KEYS.map((k) => markup(createElement(DefectGlyph, { symbol: k })).replace(/data-symbol="[^"]+"/, '').replace(/id="[^"]*"|url\(#[^)]*\)/g, ''));
    expect(new Set(bodies).size).toBe(KEYS.length);
  });

  it('strokes in the given color (condition state color)', () => {
    expect(markup(createElement(DefectGlyph, { symbol: 'crack', colour: '#EF6C00' }))).toContain('#EF6C00');
  });

  it('marker on a sheet: placed as a nested SVG at sheet mm (x, y, width), with a translucent white backing instead of the chip border', () => {
    const html = markup(createElement(DefectGlyph, { symbol: 'spall', colour: '#EF6C00', x: 100, y: 50, width: 7, framed: false, backdrop: true }));
    expect(html).toMatch(/^<svg[^>]* x="100" y="50" width="7"/);
    expect(html).toContain('fill-opacity="0.8"');
    expect(html).not.toContain('stroke="#141A1F"');
  });
});

describe('DefectLegend: sheet viewer legend (only the glyphs used on this sheet) + CS color key', () => {
  it('glyph names in the given order (printed LEGEND wording)', () => {
    const t = text(markup(createElement(DefectLegend, { symbols: ['spall', 'crack', 'other'] })));
    expect(t).toContain(`${SEval.drawings.legendTitle} Spall / delamination Cracking ${SEval.symbol.other}`);
    expect(t).toContain(SEval.drawings.csKey);
    for (const n of [1, 2, 3, 4]) expect(t).toContain(`CS${n}`);
  });
});

describe('CsHeatmapLegend: 3D condition heatmap legend (object counts)', () => {
  it('CS1-CS4 names and counts, and the count of objects without an element', () => {
    const t = text(markup(createElement(CsHeatmapLegend, { counts: { 1: 55, 2: 3, 3: 2, 4: 0, none: 21 } })));
    expect(t).toContain(SEval.model.legendTitle);
    expect(t).toContain('CS1 Good 55');
    expect(t).toContain('CS2 Fair 3');
    expect(t).toContain('CS3 Poor 2');
    expect(t).toContain('CS4 Severe 0');
    expect(t).toContain(`${SEval.model.notRated} 21`);
  });
});
