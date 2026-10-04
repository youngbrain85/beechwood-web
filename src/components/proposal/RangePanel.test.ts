// ------------------------------------------------------------------
//  Range panel of the sheet proposal screen: axis labels use the profile's station, elevation and offset formats (bridge.sta).
//  STA in 100 ft stations, EL in ft, x in ft, the same system as titles and stored values.
//  The slider values themselves are world metres (unit of the engine clip and the stored spec); only the text differs.
// ------------------------------------------------------------------
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MantineProvider } from '@mantine/core';
import { describe, expect, it } from 'vitest';
import { NO_CLIP, type Vec3 } from '@/lib/proposal/types';
import { theme } from '@/theme';
import { RangePanel } from './RangePanel';

const noop = (): void => {};

function markup(el: ReactNode): string {
  return renderToStaticMarkup(
    createElement(MantineProvider, { theme, withCssVariables: false, withGlobalClasses: false }, el),
  ).replace(/></g, '>\n<');
}

/* A selection the size of the Span B deck (BW_DECK_B): z +-13.716 m (piers 2-3), y 0-2 m, x +-5 m */
const bounds = { min: [-5, 0, -13.716] as Vec3, max: [5, 2, 13.716] as Vec3 };
const panel = (): string => markup(createElement(RangePanel, { bounds, clip: NO_CLIP, onClipChange: noop }));

/* The `start ~ end` text at the head of each axis row (text inside the tag): three rows */
const axisTexts = (html: string): string[] =>
  html
    .split('\n')
    .map((l) => /^<p [^>]*class="[^"]*tnum[^"]*"[^>]*>([^<]*)<\/p>$/.exec(l)?.[1])
    .filter((t): t is string => t !== undefined);

describe('range panel labels', () => {
  it('longitudinal STA in 100 ft stations, height EL ft, transverse x ft', () => {
    expect(axisTexts(panel())).toEqual([
      'STA 105+75.7 ~ STA 106+66.3',
      'EL 400.0 ft ~ EL 406.6 ft',
      'x -16.4 ft ~ x 16.4 ft',
    ]);
  });

  it('no metric station labels (STA 4+, m units) are mixed in', () => {
    const html = panel();
    expect(html).not.toContain('STA 4+');
    expect(axisTexts(html).filter((t) => / m\b/.test(t))).toEqual([]);
  });
});
