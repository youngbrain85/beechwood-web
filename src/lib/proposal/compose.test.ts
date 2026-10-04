import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bridge } from '@/bridge';
import { box } from './__fixtures__/shapes';
import { composeSheetSvg, isComposableSpec, type FrameMeta } from './compose';
import { runEngine } from './engine';
import { NO_CLIP, type Vec3 } from './types';

// Frame metrics: the values of public/proposal/frame_bw_meta.json (a band KEY PLAN).
const meta = {
  canvas_mm: [420, 297],
  main_area_mm: [10, 22, 304, 223],
  bw: { kp_box: [13, 248, 218, 44], padx: 18, z: [-38.405, 38.405], band_y: [265, 268], ground_y: 281 },
} as unknown as FrameMeta;
const tpl = readFileSync('public/proposal/frame_bw.svg', 'utf8');
const small = runEngine({ meshes: [box([-1, 25, 100], [1, 35, 102], 'COL')], clip: NO_CLIP, objectCodes: ['COL'] })[0]!;
const big = runEngine({ meshes: [box([-10, 28, 0], [10, 29, 60], 'SLAB')], clip: NO_CLIP, objectCodes: ['SLAB'] })[0]!;
const compose = (c: typeof small): string => composeSheetSvg(
  { template: tpl, meta, kind: 'bw', spec: c.spec, drawing: c.drawing, title: 't', mark: 'm' });

describe('composeSheetSvg', () => {
  it('A3: template + drawing + labels + ID + scale + KEY PLAN hatch + mark', () => {
    const svg = composeSheetSvg({ template: tpl, meta, kind: 'bw', spec: small.spec, drawing: small.drawing, title: small.spec.title, mark: 'PROPOSAL · Preview' });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('viewBox="0 0 420 297"');
    expect(svg).toContain('ELEMENT CONDITION QUANTITIES');
    expect(svg).toContain('ID : ' + small.spec.title);
    expect(svg).toContain(`SCALE 1 : ${small.metrics.denom}`);
    expect(svg).toContain('PROPOSAL · Preview');
    expect(svg).toContain('class="proposal-drawing"');
    expect(svg).toContain('data-role="keyplan-hatch"');
    expect((svg.match(/<svg/g) ?? []).length).toBe(1);
  });
  it('A1: scale(2) on an 841x594 canvas, so the relative size of the frame is unchanged', () => {
    expect(big.metrics.paper).toBe('A1');
    const svg = composeSheetSvg({ template: tpl, meta, kind: 'bw', spec: big.spec, drawing: big.drawing, title: 't', mark: 'm' });
    expect(svg).toContain('viewBox="0 0 841 594"');
    expect(svg).toContain('<g transform="scale(2)">');
  });
  it('view labels are drawn as stored, and the font stack starts with the names the app ships', () => {
    const svg = compose(small);
    expect(small.spec.views.length).toBeGreaterThan(0);
    for (const v of small.spec.views) expect(svg).toContain(`>${v.label}</text>`);
    for (const c of [small, big]) {
      const out = compose(c);
      expect(out).not.toContain('font-family="Pretendard"');
      expect(out).toContain(
        `font-family="'Pretendard Variable', Pretendard, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"`,
      );
    }
  });
  it('escapes special characters in the title', () => {
    const svg = composeSheetSvg({ template: tpl, meta, kind: 'bw', spec: small.spec, drawing: small.drawing, title: 'A<B & "C"', mark: 'm' });
    expect(svg).toContain('A&lt;B &amp; &quot;C&quot;');
  });
  it('the frame kind comes from the bridge profile: every range gives a kind that has a template', () => {
    for (const b of [{ min: [0, 0, -500] as Vec3, max: [1, 1, -430] as Vec3 }, { min: [0, 0, -50] as Vec3, max: [1, 1, 50] as Vec3 }]) {
      expect(Object.keys(bridge.frames.templates)).toContain(bridge.frames.kindFor(b));
    }
  });

  it('the frame kind is chosen from the range the candidate actually draws (spec.zone.bounds), not from the selection before cutting', () => {
    // A long selection cut down to one end.
    const selectionBounds = { min: [-1, 0, -400] as Vec3, max: [1, 10, 0] as Vec3 };
    const c = runEngine({
      meshes: [box([-1, 0, -400], [1, 10, 0], 'LONG')],
      clip: { x: null, y: null, z: [-50, 0] },
      objectCodes: ['LONG'],
    })[0]!;

    // The hatch of composeSheetSvg always reads spec.zone.bounds, so the frame kind must be chosen from the same value:
    // the drawn range is narrower than the selection.
    expect(c.spec.zone.bounds.min[2]).toBeGreaterThan(selectionBounds.min[2]);
    expect(Object.keys(bridge.frames.templates)).toContain(bridge.frames.kindFor(c.spec.zone.bounds));
  });
});

// ------------------------------------------------------------------
//  The frame kind is decided by the bridge profile (frames.kindFor, templates).
//  frame_bw_meta.json (made by the pipeline in mangdo/ and imported by npm run pipeline:sheets) describes
//  a "band" KEY PLAN (kp_box, padx, z, band_y: a schematic elevation with no height information).
//  The values below are those of that file.
// ------------------------------------------------------------------
describe('composeSheetSvg: a band KEY PLAN frame kind', () => {
  const bare = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 297"></svg>';
  // The whole Span B (piers 2-3, z +-13.716 m)
  const spanB = runEngine({ meshes: [box([-5, 0, -13.716], [5, 2, 13.716], 'BW_DECK_B')], clip: NO_CLIP, objectCodes: ['BW_DECK_B'] })[0]!;
  const composeBw = (kind: string): string =>
    composeSheetSvg({ template: bare, meta, kind, spec: spanB.spec, drawing: spanB.drawing, title: 't', mark: 'm' });

  it('band KEY PLAN: the selected z range maps onto the KEY PLAN horizontally; vertically it is the band (band_y +-2)', () => {
    const g = /<g data-role="keyplan-hatch">([\s\S]*?)<\/g>/.exec(composeBw('bw'))![1]!;
    const r = /<rect x="(-?[\d.]+)" y="(-?[\d.]+)" width="(-?[\d.]+)" height="(-?[\d.]+)"/.exec(g)!;
    // Computed independently of the implementation: sx = (kw - 2 padx) / (z1 - z0)
    const sx = (218 - 2 * 18) / (38.405 * 2);
    const [z0, z1] = [spanB.spec.zone.bounds.min[2], spanB.spec.zone.bounds.max[2]];
    expect(Number(r[1])).toBeCloseTo(13 + 18 + (z0 + 38.405) * sx, 1);
    expect(Number(r[3])).toBeCloseTo((z1 - z0) * sx, 1);
    expect([Number(r[2]), Number(r[4])]).toEqual([263, 7]);
  });

  it('a kind missing from the frame metrics composes without the hatch (no throw)', () => {
    const svg = composeBw('nope');
    expect(svg).toContain('<g data-role="keyplan-hatch"></g>');
    expect(svg).toContain('ID : t');
  });
});

// ------------------------------------------------------------------
//  A spec read from the database (sheet_proposals.spec) is validated before composing;
//  only what composeSheetSvg **actually reads** is checked.
// ------------------------------------------------------------------
describe('isComposableSpec', () => {
  /* A real spec emitted by the engine; it must pass. */
  const good = (): unknown => JSON.parse(JSON.stringify(small.spec));
  /* Breaks a real spec in exactly one place (the rest is intact, so that one place is clearly the cause). */
  const broken = (mut: (s: Record<string, any>) => void): unknown => {
    const s = good() as Record<string, any>;
    mut(s);
    return s;
  };

  it('engine specs pass, both A3 and A1', () => {
    expect(isComposableSpec(good())).toBe(true);
    expect(isComposableSpec(JSON.parse(JSON.stringify(big.spec)))).toBe(true);
  });

  it.each([
    ['layout.scale is a number', broken((s) => { s.layout.scale = 50; })],
    ['layout.scale escapes the quote', broken((s) => { s.layout.scale = '1:50"><x'; })],
    ['layout is missing', broken((s) => { delete s.layout; })],
    ['canvas_mm is a string', broken((s) => { s.canvas_mm = '420,297'; })],
    ['canvas_mm has one value', broken((s) => { s.canvas_mm = [420]; })],
    ['canvas_mm holds NaN', broken((s) => { s.canvas_mm = [420, Number.NaN]; })],
    ['views is empty', broken((s) => { s.views = []; })],
    ['views has 65 entries', broken((s) => { s.views = Array.from({ length: 65 }, () => s.views[0]); })],
    ['views is not an array', broken((s) => { s.views = { v1: s.views[0] }; })],
    ['placement has 3 values', broken((s) => { s.views[0].placement = [0, 0, 1]; })],
    ['placement holds infinity', broken((s) => { s.views[0].placement = [0, 0, 1, Number.POSITIVE_INFINITY]; })],
    ['label is not a string', broken((s) => { s.views[0].label = 3; })],
    ['zone is missing', broken((s) => { delete s.zone; })],
    ['zone.bounds.min has 2 values', broken((s) => { s.zone.bounds.min = [0, 0]; })],
    ['zone.bounds.max holds null', broken((s) => { s.zone.bounds.max = [0, null, 0]; })],
    ['null', null],
    ['a string', '<svg/>'],
  ])('%s is rejected', (_name, spec) => {
    expect(isComposableSpec(spec)).toBe(false);
  });
});
