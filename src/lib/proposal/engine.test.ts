import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bridge } from '@/bridge';
import { box } from './__fixtures__/shapes';
import { EngineError, runEngine } from './engine';
import { uvToWorld } from './spec';
import { MAX_TRIANGLES, NO_CLIP, type MeshInput } from './types';

const parity = JSON.parse(readFileSync('src/lib/proposal/__fixtures__/parity.json', 'utf8')) as { cases: Array<{ name: string; meshes: Array<{ name: string; positions: number[]; indices: number[] }> }> };
const input = (name: string): MeshInput[] => parity.cases.find((c) => c.name === name)!.meshes
  .map((m) => ({ name: m.name, objectId: m.name.split('::')[0]!, fine: 'Pier column', positions: new Float64Array(m.positions), indices: new Uint32Array(m.indices) }));

/* A mesh over the limit: the same triangle repeated, 3 vertices and MAX_TRIANGLES+1 faces. */
const overSized = (): MeshInput => {
  const n = MAX_TRIANGLES + 1;
  const indices = new Uint32Array(n * 3);
  for (let i = 0; i < n; i++) {
    indices[3 * i] = 0;
    indices[3 * i + 1] = 1;
    indices[3 * i + 2] = 2;
  }
  return { name: 'HUGE', objectId: 'HUGE', fine: 'Accessory', positions: new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), indices };
};

const errorOf = (run: () => unknown): EngineError => {
  try {
    run();
  } catch (e) {
    return e as EngineError;
  }
  throw new Error('no error was thrown');
};

describe('runEngine', () => {
  it('column box: 3 candidates in descending covered area, with specs in the zone_spec shape', () => {
    const c = runEngine({ meshes: [box([-1, 0, -1], [1, 10, 1], 'COL')], clip: NO_CLIP, objectCodes: ['COL'] });
    expect(c.map((x) => x.key)).toEqual(['four_side', 'three_view', 'single']);
    expect(c[0]!.metrics.coverage).toBeCloseTo(80 / 88, 6);
    const s = c[0]!.spec;
    expect([s.canvas_mm, s.engine, s.zone.objects, s.views.length]).toEqual([[420, 297], 'proposal-ts@1', ['COL'], 4]);
    // The title follows the stored-value rules of the bridge profile.
    // The fine member is the fine of the input meshes as is (the shared fixture box() has fine 'Accessory').
    expect(s.title).toBe('Accessory (COL) — Four-Side Development');
    // (0,0) and (1,1) of the spec lie inside the bbox of the selection (+-1e-6)
    for (const v of s.views) for (const [u, w] of [[0, 0], [1, 1]] as const) {
      const p = uvToWorld(v, u, w);
      expect(p[0]).toBeGreaterThanOrEqual(-1 - 1e-6); expect(p[1]).toBeLessThanOrEqual(10 + 1e-6);
    }
    expect(c[0]!.drawing.startsWith('<g')).toBe(true);
    expect(/[\uAC00-\uD7A3]/.test(c[0]!.drawing)).toBe(false);     // the drawing is language-neutral
  });
  it('the fine member in the title is "the one drawn largest", not the most frequent by mesh count', () => {
    // Small members are many by count, but large faces dominate the drawing.
    // (Counting meshes would name a deck panel after its many small cross members.)
    const small = Array.from({ length: 5 }, (_, i) => ({
      ...box([i, 0, 0], [i + 0.2, 0.2, 0.2], `FB${i}`),
      fine: 'Cross-frame',
    }));
    const big = { ...box([0, 0, 1], [20, 3, 3], 'G1'), fine: 'Beam' };
    const c = runEngine({ meshes: [...small, big], clip: NO_CLIP, objectCodes: ['BW_DECK_B'] });
    expect(c[0]!.spec.title.startsWith('Beam (')).toBe(true);
  });

  it('falls back to the default fine member when no mesh has fine', () => {
    const nameless = { ...box([0, 0, 0], [1, 1, 1], 'X'), fine: '' };
    const c = runEngine({ meshes: [nameless], clip: NO_CLIP, objectCodes: ['X'] });
    expect(c[0]!.spec.title.startsWith('Other (')).toBe(true);
  });

  it('golden: candidate compositions of three model selections', () => {
    const got = Object.fromEntries(['bw_beam_b2', 'bw_deck_b', 'bw_col_b2_1'].map((n) =>
      [n, runEngine({ meshes: input(n), clip: NO_CLIP, objectCodes: [n] }).map((x) => `${x.key}:${x.metrics.views}:${x.metrics.paper}:${x.metrics.denom}`)]));
    expect(got).toMatchSnapshot();
  });
  it('an empty or oversized selection gives an error code', () => {
    expect(() => runEngine({ meshes: [], clip: NO_CLIP, objectCodes: [] })).toThrowError(EngineError);
    expect(errorOf(() => runEngine({ meshes: [], clip: NO_CLIP, objectCodes: [] })).code).toBe('empty');
    expect(errorOf(() => runEngine({ meshes: [overSized()], clip: NO_CLIP, objectCodes: ['HUGE'] })).code).toBe('too_large');
  });

  it('the cut range and bounds go into the spec with 4 decimals, and views carry only the narrowed axes', () => {
    const c = runEngine({
      meshes: [box([-1, 0, -1], [1, 10, 1], 'COL')],
      clip: { x: null, y: [2.123456, 7.987654], z: null },
      objectCodes: ['COL'],
    });
    expect(c[0]!.spec.zone.clip).toEqual({ x: null, y: [2.1235, 7.9877], z: null });
    expect(c[0]!.spec.zone.bounds.min[1]).toBeCloseTo(0, 6);    // cut by face center, so vertices reach a little further
    // So a sheet builder can reproduce per view: only the narrowed axes, with the same 4 decimals as zone.clip.
    for (const v of c[0]!.spec.views) expect(v.clip).toEqual({ y: [2.1235, 7.9877] });
    expect(c[0]!.spec.title).toBe(
      'Accessory (COL, EL 407.0–426.2 ft) — Four-Side Development',
    );
  });

  it('an axis that was not narrowed has no key in a view clip; with nothing narrowed there is no clip at all', () => {
    const none = runEngine({ meshes: [box([-1, 0, -1], [1, 10, 1], 'COL')], clip: NO_CLIP, objectCodes: ['COL'] });
    expect(none[0]!.spec.views.every((v) => v.clip === undefined)).toBe(true);

    const two = runEngine({
      meshes: [box([-1, 0, -1], [1, 10, 1], 'COL')],
      clip: { x: [-0.5, 0.5], y: null, z: [-0.75, 0.75] },
      objectCodes: ['COL'],
    });
    for (const v of two[0]!.spec.views) expect(v.clip).toEqual({ z: [-0.75, 0.75], x: [-0.5, 0.5] });
    // Each view has its own object: a shared object would leak an edit of one view into another.
    const [first, second] = two[0]!.spec.views;
    expect(second).toBeDefined();
    expect(first!.clip).not.toBe(second!.clip);
  });

  it('the spec records enough for a sheet builder to reproduce it: coordinate frame, placement, paper', () => {
    const a3 = runEngine({ meshes: [box([-1, 0, -1], [1, 10, 1], 'COL')], clip: NO_CLIP, objectCodes: ['COL'] })[0]!;
    // The same keys and values as the generator's zone_spec: placement is normalized from the top left of the canvas.
    expect(a3.spec.placement_frame).toBe('topleft_normalized');
    expect([a3.spec.layout.arrangement, a3.spec.layout.paper]).toEqual(['row', 'A3']);

    const a1 = runEngine({ meshes: [box([0, 0, 0], [20, 10, 200], 'DECK')], clip: NO_CLIP, objectCodes: ['DECK'] })[0]!;
    expect(a1.spec.layout.paper).toBe('A1');
    // Paper and scale of the spec must come from the same source as the values shown on the card.
    for (const c of [a3, a1]) {
      expect(c.spec.layout.paper).toBe(c.metrics.paper);
      expect(c.spec.layout.scale).toBe(`1:${c.metrics.denom}`);
    }
  });

  it('drawing fragment: each view inside its slot, hidden lines first and solid lines after, no text (both A3 and A1)', () => {
    const four = runEngine({ meshes: [box([-1, 0, -1], [1, 10, 1], 'COL')], clip: NO_CLIP, objectCodes: ['COL'] })[0]!;
    expect(four.drawing.startsWith('<g class="proposal-drawing">')).toBe(true);
    expect(four.drawing).not.toContain('<text');
    // Hidden lines (#c0c0c0) come before solid lines (#000), so the solid line drawn later stays on top.
    expect(four.drawing).toContain('#c0c0c0');
    expect(four.drawing.indexOf('#c0c0c0')).toBeLessThan(four.drawing.indexOf('#000'));

    // For A1 the fragment is in A3 coordinates while placement is relative to 841x594; dividing by 2 makes them point at the same spot.
    const a1 = runEngine({ meshes: [box([0, 0, 0], [20, 10, 200], 'DECK')], clip: NO_CLIP, objectCodes: ['DECK'] })[0]!;
    expect(a1.metrics.paper).toBe('A1');

    for (const c of [four, a1]) {
      const [cw, ch] = c.spec.canvas_mm;
      const k = cw > 500 ? 2 : 1;
      for (const v of c.spec.views) {
        const [px, py, pw, ph] = v.placement;
        // Placement is always inside the paper; a negative value or one above 1 is a drawing off the sheet.
        expect(px).toBeGreaterThanOrEqual(0);
        expect(py).toBeGreaterThanOrEqual(0);
        expect(px + pw).toBeLessThanOrEqual(1);
        expect(py + ph).toBeLessThanOrEqual(1);
        const g = new RegExp(`<g data-view="${v.id}">([\\s\\S]*?)</g>`).exec(c.drawing)![1]!;
        const points = [...g.matchAll(/[ML] (-?[\d.]+) (-?[\d.]+)/g)];
        expect(points.length).toBeGreaterThan(0);
        for (const [, sx, sy] of points) {
          expect(Number(sx)).toBeGreaterThanOrEqual((px * cw) / k - 0.02);
          expect(Number(sx)).toBeLessThanOrEqual(((px + pw) * cw) / k + 0.02);
          expect(Number(sy)).toBeGreaterThanOrEqual((py * ch) / k - 0.02);
          expect(Number(sy)).toBeLessThanOrEqual(((py + ph) * ch) / k + 0.02);
        }
      }
    }
  });

  it('a selection that does not fit one sheet gives the error code no_fit instead of an overflowing drawing', () => {
    // 700 m x 1 m: far beyond the drawing area (304 mm) even at A1 1:1000.
    const run = (): unknown =>
      runEngine({ meshes: [box([0, 0, 0], [1, 1, 700], 'LONG')], clip: NO_CLIP, objectCodes: ['LONG'] });
    expect(run).toThrowError(EngineError);
    expect(errorOf(run).code).toBe('no_fit');
  });

  it('engine diagnostics are ASCII; screen texts are chosen by code', () => {
    const codes = [
      errorOf(() => runEngine({ meshes: [], clip: NO_CLIP, objectCodes: [] })),
      errorOf(() => runEngine({ meshes: [overSized()], clip: NO_CLIP, objectCodes: ['HUGE'] })),
      errorOf(() => runEngine({ meshes: [box([0, 0, 0], [1, 1, 700], 'LONG')], clip: NO_CLIP, objectCodes: ['LONG'] })),
    ];
    expect(codes.map((e) => e.code)).toEqual(['empty', 'too_large', 'no_fit']);
    for (const e of codes) {
      expect(/[\uAC00-\uD7A3]/.test(e.message)).toBe(false);
      // eslint-disable-next-line no-control-regex
      expect(/^[\x20-\x7e]+$/.test(e.message)).toBe(true);
    }
  });

  it('the bridge name of a spec is the stored value (profile storedName)', () => {
    const s = runEngine({ meshes: [box([-1, 0, -1], [1, 10, 1], 'COL')], clip: NO_CLIP, objectCodes: ['COL'] })[0]!.spec;
    expect(s.bridge).toBe(bridge.storedName);
    expect(s.bridge).toBe('Beechwood Rd over Little Blue River');
  });

  it('progress advances by 1 per projection and is filled at the end', () => {
    const calls: Array<[number, number]> = [];
    runEngine(
      { meshes: [box([-1, 0, -1], [1, 10, 1], 'COL')], clip: NO_CLIP, objectCodes: ['COL'] },
      (done, total) => calls.push([done, total]),
    );
    const total = calls[0]![1];
    expect(calls.map(([done]) => done)).toEqual(Array.from({ length: total }, (_, i) => i + 1));
    expect(calls.every(([, t]) => t === total)).toBe(true);
  });
});
