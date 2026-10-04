// ------------------------------------------------------------------
//  AASHTO dashboard (/): when the v_nbi_components or v_element_condition query fails the page shows the hook's
//  error text (the English sentence is in s.eval) instead of a silent N/A.
//  The hooks do not run without a renderer (useEffect), so the query hook module is replaced by a fake; a failing fake has
//  exactly the shape a hook returns on a query error ({ data: [], loading: false, error: Error(PostgREST message) }).
//  The page is rendered once on the server (renderToStaticMarkup).
// ------------------------------------------------------------------
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MantineProvider } from '@mantine/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SEval } from '@/i18n/s.eval';
import { theme } from '@/theme';

// A vi.mock factory is hoisted; the fake query results and their state are hoisted with it through vi.hoisted.
const fx = vi.hoisted(() => {
  const ok = (data: unknown[]) => ({ data, loading: false, error: null as Error | null, refetch: () => {} });
  const failing = (message: string) => ({ ...ok([]), error: new Error(message) });
  return { ok, failing, nbi: ok([]), cond: ok([]) };
});

vi.mock('@/hooks/useSupabase', () => ({
  useObjects: () => fx.ok([]),
  useDamages: () => fx.ok([]),
  useSheets: () => fx.ok([]),
  useObjectElements: () => fx.ok([]),
  useAashtoElements: () => fx.ok([]),
  useNbiComponents: () => fx.nbi,
  useElementCondition: () => fx.cond,
}));

import { AashtoOverview } from './AashtoOverview';

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
const page = (): string => markup(createElement(AashtoOverview));

/* The text PostgREST returns when a view does not exist (a database where the schema has not been run) */
const NBI_ERR = 'relation "public.v_nbi_components" does not exist';
const COND_ERR = 'relation "public.v_element_condition" does not exist';

beforeEach(() => {
  fx.nbi = fx.ok([
    { component: 'deck', rating: 8 },
    { component: 'super', rating: 6 },
    { component: 'sub', rating: 8 },
  ]);
  fx.cond = fx.ok([
    { element_no: 109, name: 'Prestressed Concrete Open Girder/Beam', unit: 'ft', category: 'super', total_qty: 1000, cs1: 996, cs2: 0, cs3: 4, cs4: 0, rating: 6 },
  ]);
});

describe('AashtoOverview: a failed query shows an error text, not a silent N/A', () => {
  it('normal: three component ratings, overall condition, element summary, no error text', () => {
    const html = page();
    const t = text(html);
    expect(t).toContain('Superstructure 6 Satisfactory Fair');
    expect(t).toContain(`${SEval.overview.overallTitle} Fair`);
    expect(t).toContain('109 Prestressed Concrete Open Girder/Beam 1,000 ft CS3');
    expect(t).not.toContain('Could not load');
    expect(html).not.toContain('role="alert"');
  });

  it('v_nbi_components fails: the hero shows the hook error text (instead of N/A tiles for the ratings and overall condition)', () => {
    fx.nbi = fx.failing(NBI_ERR);
    const html = page();
    const t = text(html);
    expect(t).toContain(SEval.overview.ratingsError(NBI_ERR));
    expect(t).toContain(NBI_ERR);
    expect(t).not.toMatch(/(Deck|Superstructure|Substructure) N\/A/);
    expect(t).not.toContain(`${SEval.overview.overallTitle} N/A`);
    expect(html.match(/role="alert"/g)).toHaveLength(1);
  });

  it('v_element_condition fails: the element summary shows the hook error text (and no "0 elements" hint)', () => {
    fx.cond = fx.failing(COND_ERR);
    const html = page();
    const t = text(html);
    expect(t).toContain(SEval.overview.elementsError(COND_ERR));
    expect(t).not.toContain(SEval.overview.elementsHint(0));
    expect(t).toContain('Superstructure 6 Satisfactory Fair'); // the ratings are unaffected
    expect(html.match(/role="alert"/g)).toHaveLength(1);
  });

  it('both fail: two error texts', () => {
    fx.nbi = fx.failing(NBI_ERR);
    fx.cond = fx.failing(COND_ERR);
    const t = text(page());
    expect(t).toContain(SEval.overview.ratingsError(NBI_ERR));
    expect(t).toContain(SEval.overview.elementsError(COND_ERR));
  });
});
