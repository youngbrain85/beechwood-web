// ------------------------------------------------------------------
//  Dashboard hero: three component ratings (0-9, SNBI band color), overall condition (Good/Fair/Poor) and the computed-indicator notice.
//  The ratings come from v_nbi_components rows (looked up by component); nothing is recomputed here.
// ------------------------------------------------------------------
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MantineProvider } from '@mantine/core';
import { describe, expect, it } from 'vitest';
import { SEval } from '@/i18n/s.eval';
import type { NbiComponentRow } from '@/types/db';
import { theme } from '@/theme';
import { NbiHero, ratingsFromRows } from './NbiHero';

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

/* Fixture v_nbi_components (columns component, rating); the order is not guaranteed (the view has no sort key) */
const ROWS: NbiComponentRow[] = [
  { component: 'sub', rating: 8 },
  { component: 'deck', rating: 8 },
  { component: 'super', rating: 6 },
];

const hero = (ratings = ratingsFromRows(ROWS)): string =>
  markup(
    createElement(NbiHero, {
      bridgeName: 'Beechwood Bridge',
      bridgeSub: 'Beechwood Rd over Little Blue River · Crawford County, Indiana',
      ratings,
      facts: { objects: 80, damages: 6, sheets: 23, lastObserved: '2026-09-21' },
    }),
  );

describe('ratingsFromRows: v_nbi_components rows are looked up by component (any order)', () => {
  it('deck 8 · super 6 · sub 8', () => {
    expect(ratingsFromRows(ROWS)).toEqual({ deck: 8, super: 6, sub: 8 });
  });

  it('gives null for a component with no row', () => {
    expect(ratingsFromRows([ROWS[1]!])).toEqual({ deck: 8, super: null, sub: null });
    expect(ratingsFromRows([])).toEqual({ deck: null, super: null, sub: null });
  });
});

describe('NbiHero', () => {
  it('bridge name, subtitle (profile) and four facts', () => {
    const t = text(hero());
    expect(t).toContain('Beechwood Bridge');
    expect(t).toContain('Beechwood Rd over Little Blue River · Crawford County, Indiana');
    for (const s of ['Objects 80', 'Damage Records 6', 'Map Sheets 23', 'Last Observed 2026-09-21']) expect(t).toContain(s);
  });

  it('three component ratings: number, NBI descriptor, band', () => {
    const t = text(hero());
    expect(t).toContain('Deck 8 Very Good Good');
    expect(t).toContain('Superstructure 6 Satisfactory Fair');
    expect(t).toContain('Substructure 8 Very Good Good');
  });

  it('overall condition = band of the minimum of the three (6 is Fair); band colors come from the CS palette', () => {
    const html = hero();
    expect(text(html)).toContain(`${SEval.overview.overallTitle} Fair`);
    expect(html).toContain('#F9A825'); // Fair(super 6)
    expect(html).toContain('#2E7D32'); // Good(deck · sub 8)
  });

  it('0-9 scale: ten cells per component with only the current rating cell marked (data-current)', () => {
    const html = hero();
    expect(html.match(/data-rating-cell="/g)).toHaveLength(30);
    expect(html.match(/data-current="true"/g)).toHaveLength(3);
  });

  it('computed-indicator notice: these are not official NBI ratings', () => {
    expect(text(hero())).toContain(SEval.computedNote);
  });

  it('shows N/A for a component without a rating, and N/A overall (all three are required)', () => {
    const t = text(hero({ deck: 8, super: null, sub: 7 }));
    expect(t).toContain('Superstructure N/A');
    expect(t).toContain(`${SEval.overview.overallTitle} N/A`);
  });
});

// ------------------------------------------------------------------
//  Narrow screens: a hero that insists on one row squeezes the fact cells to 37 px at 1280 px.
//  The rating group drops below the bridge cell when there is no room beside it (bridge cell basis 360 px, below
//  about 1400 px), fact cells wrap instead of shrinking under 112 px, and rating tiles wrap too (portrait phone).
// ------------------------------------------------------------------
describe('NbiHero: wrapping layout', () => {
  const html = hero();
  const styleOf = (attr: string): string => new RegExp(`<[a-z]+ ${attr}=""[^>]*style="([^"]*)"`).exec(html)?.[1] ?? '';

  it('the body is a wrapping flex row: bridge cell (basis 360 px, grows) and the rating group', () => {
    expect(styleOf('data-hero-body')).toContain('flex-wrap:wrap');
    expect(styleOf('data-hero-identity')).toContain('flex:1 1 360px');
    expect(styleOf('data-hero-ratings')).toContain('flex-wrap:wrap');
  });

  it('fact cells are at least 112 px and wrap when narrow', () => {
    expect(html).toContain('grid-template-columns:repeat(auto-fit, minmax(112px, 1fr))');
  });
});
