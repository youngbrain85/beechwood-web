import { describe, expect, it } from 'vitest';
import { box } from './__fixtures__/shapes';
import { clipMeshes } from './clip';
import type { ExistingSheet, ExistingView } from './existing';
import { existingSheetsFromRows, findCoveringSheets } from './existing';
import { NO_CLIP } from './types';

// ------------------------------------------------------------------
//  Synthetic view A: origin[0,0,0], u[0,0,1], v[1,0,0], normal[0,-1,0], extent[10,4],
//  so a world point (x,y,z) has u=z/10, v=x/4, d=-y. No clip.
// ------------------------------------------------------------------
const viewA = (over: Partial<ExistingView> = {}): ExistingView => ({
  origin: [0, 0, 0], u: [0, 0, 1], v: [1, 0, 0], normal: [0, -1, 0], extent: [10, 4], clip: null, ...over,
});

const sheet = (sheetId: string, family: string, views: ExistingView[], title = sheetId): ExistingSheet =>
  ({ sheetId, title, family, views });

/* A 4x0.2x10 box: bottom and top faces are 40 each, total surface 85.6. View A shows the bottom face only. */
const SLAB = () => clipMeshes([box([0, 0.2, 0], [4, 0.4, 10])], NO_CLIP);
const SLAB_AREA = 85.6;
const FACE_AREA = 40;
const SLAB_RATIO = FACE_AREA / SLAB_AREA; // ≈ 0.4673

describe('findCoveringSheets: family, area, clip', () => {
  it('with a matching family only the bottom face (area 40) is covered: ratio = 40/85.6', () => {
    const got = findCoveringSheets(SLAB(), ['Deck'], [sheet('S1', 'Deck', [viewA()], 'Sheet 1')]);
    expect(got).toHaveLength(1);
    expect(got[0]!.sheetId).toBe('S1');
    expect(got[0]!.title).toBe('Sheet 1');
    expect(got[0]!.ratio).toBeCloseTo(SLAB_RATIO, 9);
  });

  it('sheets of another family are not examined at all', () => {
    expect(findCoveringSheets(SLAB(), ['Deck'], [sheet('C1', 'Railing', [viewA()])])).toEqual([]);
    expect(findCoveringSheets(SLAB(), [], [sheet('S1', 'Deck', [viewA()])])).toEqual([]);
  });

  it('gives an empty result without faces', () => {
    expect(findCoveringSheets([], ['Deck'], [sheet('S1', 'Deck', [viewA()])])).toEqual([]);
  });

  it('a flipped view normal covers the top face; moved outside the depth window it drops out', () => {
    const flipped = viewA({ normal: [0, 1, 0] });
    const near = findCoveringSheets(SLAB(), ['Deck'], [sheet('S1', 'Deck', [flipped])]);
    expect(near[0]!.ratio).toBeCloseTo(SLAB_RATIO, 9); // the top face area is 40 as well

    const far = viewA({ normal: [0, 1, 0], origin: [0, 20, 0] }); // d = 0.4 − 20 = −19.6
    expect(findCoveringSheets(SLAB(), ['Deck'], [sheet('S1', 'Deck', [far])])).toEqual([]);
  });

  it('clip and depth window are both checked; both must match', () => {
    // Even with a matching clip, a view plane 30 m away (d = 29.8, outside the depth window [-7,0.5]) covers nothing.
    // A clip usually leaves the view's depth axis open,
    // so by the clip alone a twin member offset only along the depth axis would come in as well.
    const high = viewA({ origin: [0, 30, 0], clip: { y: [0, 1] } });
    expect(findCoveringSheets(SLAB(), ['Deck'], [sheet('S1', 'Deck', [high])])).toEqual([]);

    // Back inside the depth window and with a matching clip it is covered (d = -0.2).
    const near = viewA({ clip: { y: [0, 1] } });
    const got = findCoveringSheets(SLAB(), ['Deck'], [sheet('S1', 'Deck', [near])]);
    expect(got[0]!.ratio).toBeCloseTo(SLAB_RATIO, 9);

    // Inside the depth window but with a mismatched clip it drops out (the face centers are at z 3.33 and 6.67).
    const off = viewA({ clip: { z: [20, 30] } });
    expect(findCoveringSheets(SLAB(), ['Deck'], [sheet('S1', 'Deck', [off])])).toEqual([]);
  });

  it('counts by area, not by point count: 100 tiny faces outside the view cannot move the ratio', () => {
    // 100 tiny boxes (12 faces each) are placed outside the view (z=500): the face count grows 100-fold, 12 to 1212,
    // while the total area is only 0.06. Counting points, the ratio would collapse to 1/100 here.
    const tiny = Array.from({ length: 100 }, (_, i) =>
      box([0, 0.2, 500], [0.01, 0.21, 500.01], `t${i}`));
    const meshes = clipMeshes([box([0, 0.2, 0], [4, 0.4, 10]), ...tiny], NO_CLIP);
    const got = findCoveringSheets(meshes, ['Deck'], [sheet('S1', 'Deck', [viewA()])]);
    expect(got[0]!.ratio).toBeCloseTo(SLAB_RATIO, 3);
    expect(got[0]!.ratio).toBeLessThan(SLAB_RATIO); // the denominator grows very slightly
  });

  it('maxFaces: only the largest faces are used and the denominator is their partial sum', () => {
    // Areas of the 12 box faces: 20 x 4 (2 bottom, 2 top), 1 x 4 (x faces), 0.4 x 4 (z faces).
    // With a stable sort by descending area the top 2 faces are the two bottom triangles (20 each): denominator 40, covered 40.
    const got = findCoveringSheets(SLAB(), ['Deck'], [sheet('S1', 'Deck', [viewA()])], { maxFaces: 2 });
    expect(got[0]!.ratio).toBeCloseTo(1, 9);
  });

  it('several views of a sheet are a union: a face covered by two views counts once', () => {
    const two = findCoveringSheets(SLAB(), ['Deck'], [sheet('S1', 'Deck', [viewA(), viewA()])]);
    expect(two[0]!.ratio).toBeCloseTo(SLAB_RATIO, 9); // a wrong sum would double it

    const both = findCoveringSheets(SLAB(), ['Deck'],
      [sheet('S1', 'Deck', [viewA(), viewA({ normal: [0, 1, 0] })])]);
    expect(both[0]!.ratio).toBeCloseTo((FACE_AREA * 2) / SLAB_AREA, 9); // bottom + top
  });

  it('descending ratio, ascending sheetId on ties, minRatio, limit', () => {
    const wide = viewA();
    const half = viewA({ extent: [10, 2] }); // v=x/2, so faces with x>2 drop out
    const rows = [
      sheet('B', 'Deck', [wide]),
      sheet('A', 'Deck', [wide]),
      sheet('C', 'Deck', [half]),
    ];
    expect(findCoveringSheets(SLAB(), ['Deck'], rows).map((c) => c.sheetId)).toEqual(['A', 'B', 'C']);
    expect(findCoveringSheets(SLAB(), ['Deck'], rows, { limit: 2 }).map((c) => c.sheetId)).toEqual(['A', 'B']);
    expect(findCoveringSheets(SLAB(), ['Deck'], rows, { minRatio: 0.4 }).map((c) => c.sheetId))
      .toEqual(['A', 'B']);
  });

  it('skips a view with a 0 in extent (so 0/0=NaN cannot slip past the range check)', () => {
    expect(findCoveringSheets(SLAB(), ['Deck'], [sheet('Z', 'Deck', [viewA({ extent: [0, 4] })])])).toEqual([]);
    expect(findCoveringSheets(SLAB(), ['Deck'], [sheet('Z', 'Deck', [viewA({ extent: [10, 0] })])])).toEqual([]);
  });

  it('a view with normal null skips the normal test and is judged by |d| alone', () => {
    // cross(u,v) = [0,1,0]. Without the normal test all 12 box faces are inside the rectangle and |d| <= 0.4 <= 7,
    // so the ratio is 1, against 0.4673 for the view with a normal at the same place.
    const got = findCoveringSheets(SLAB(), ['Deck'], [sheet('N', 'Deck', [viewA({ normal: null })])]);
    expect(got[0]!.ratio).toBeCloseTo(1, 9);

    // The |d| rule still applies: raised 20 m, |d| = 19.7 > 7 and nothing is covered.
    const far = viewA({ normal: null, origin: [0, 20, 0] });
    expect(findCoveringSheets(SLAB(), ['Deck'], [sheet('N', 'Deck', [far])])).toEqual([]);
  });
});

describe('existingSheetsFromRows', () => {
  const view = {
    id: 'v1', placement: [0, 0, 1, 1], origin: [1, 2, 3], u: [0, 0, 1], v: [1, 0, 0],
    normal: [0, -1, 0], extent_m: [10, 4], clip: { z: [0, 10] },
  };
  const row = (over: Record<string, unknown> = {}) => ({
    title: 'Sheet 1',
    zone_type: 'Deck',
    zone_spec: { sheet_id: 'MANGDO-X', views: [view] },
    ...over,
  });

  it('a valid row gives an ExistingSheet', () => {
    expect(existingSheetsFromRows([row()])).toEqual([{
      sheetId: 'MANGDO-X',
      title: 'Sheet 1',
      family: 'Deck',
      views: [{
        origin: [1, 2, 3], u: [0, 0, 1], v: [1, 0, 0],
        normal: [0, -1, 0], extent: [10, 4], clip: { z: [0, 10] },
      }],
    }]);
  });

  it('skips rows without sheet_id, zone_type or views', () => {
    expect(existingSheetsFromRows([row({ zone_spec: { views: [view] } })])).toEqual([]);
    expect(existingSheetsFromRows([row({ zone_type: null })])).toEqual([]);
    expect(existingSheetsFromRows([row({ zone_spec: { sheet_id: 'A' } })])).toEqual([]);
    expect(existingSheetsFromRows([{ title: 'x', zone_type: 'Deck', zone_spec: null }])).toEqual([]);
  });

  it('a broken view is skipped on its own; with no view left the sheet drops out too', () => {
    const broken = { ...view, origin: [1, 2] };
    expect(existingSheetsFromRows([row({ zone_spec: { sheet_id: 'A', views: [broken, view] } })])[0]!.views)
      .toHaveLength(1);
    expect(existingSheetsFromRows([row({ zone_spec: { sheet_id: 'A', views: [broken] } })])).toEqual([]);
  });

  it('normal is null when absent, and clip is kept only when well-formed', () => {
    const noNormal = { ...view, normal: undefined, clip: undefined };
    expect(existingSheetsFromRows([row({ zone_spec: { sheet_id: 'A', views: [noNormal] } })])[0]!.views[0])
      .toEqual({ origin: [1, 2, 3], u: [0, 0, 1], v: [1, 0, 0], normal: null, extent: [10, 4], clip: null });

    const badClip = { ...view, clip: { z: [0] } };
    expect(existingSheetsFromRows([row({ zone_spec: { sheet_id: 'A', views: [badClip] } })])[0]!.views[0]!.clip)
      .toBeNull();

    const partial = { ...view, clip: { x: [0, 1], q: [2, 3] } };
    expect(existingSheetsFromRows([row({ zone_spec: { sheet_id: 'A', views: [partial] } })])[0]!.views[0]!.clip)
      .toEqual({ x: [0, 1] });
  });
});
