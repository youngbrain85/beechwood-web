// Station and elevation labels: model coordinates (m) to US customary labels (ft).
// Coordinate definition: docs/dimensions.md section 5 of the pipeline repository
//   z_m = (sta_ft - 10621) x 0.3048 (C Structure Sta. 106+21.00 is z=0), y_m = (El_ft - 400) x 0.3048, x_m = offset_ft x 0.3048
import { describe, expect, it } from 'vitest';
import { NO_CLIP } from '@/lib/proposal/types';
import { clipLabels, elLabel, staLabel, xLabel } from './sta';

const FT = 0.3048;
/* Station (ft) to model z (m) */
const zOf = (staFt: number) => (staFt - 10621) * FT;
/* Elevation (ft) to model y (m) */
const yOf = (elFt: number) => (elFt - 400) * FT;

describe('STA label: STA hhh+ff.f', () => {
  it('z=0 is C Structure STA 106+21.0', () => {
    expect(staLabel(0)).toBe('STA 106+21.0');
  });

  it('bent stations (drawing sheet 31): End Bent 1, Bent 2, Bent 3, End Bent 4', () => {
    expect(staLabel(-38.1)).toBe('STA 104+96.0');
    expect(staLabel(-13.716)).toBe('STA 105+76.0');
    expect(staLabel(13.716)).toBe('STA 106+66.0');
    expect(staLabel(38.1)).toBe('STA 107+46.0');
  });

  it('rounds to one decimal first, so 105+99.96 becomes 106+00.0 and never 105+100.0', () => {
    expect(staLabel(zOf(10599.96))).toBe('STA 106+00.0');
    expect(staLabel(zOf(10500))).toBe('STA 105+00.0');
    expect(staLabel(zOf(10505.26))).toBe('STA 105+05.3');
  });
});

describe('EL label: EL nnn.n ft', () => {
  it('y=0 is EL 400.0 ft', () => {
    expect(elLabel(0)).toBe('EL 400.0 ft');
  });

  it('Bent 2 grade El. 428.41 gives EL 428.4 ft', () => {
    expect(elLabel(yOf(428.41))).toBe('EL 428.4 ft');
  });
});

describe('offset label: x n.n ft (the same value as x in a range label)', () => {
  it('x 0, left (west, -) and right (east, +): ft with one decimal, negatives with the - of toFixed', () => {
    expect(xLabel(0)).toBe('x 0.0 ft');
    expect(xLabel(-1.524)).toBe('x -5.0 ft');
    expect(xLabel(5)).toBe('x 16.4 ft');
  });

  it('uses the same number as the x value of a range label (clipLabels)', () => {
    expect(clipLabels({ x: [-1.524, 5], y: null, z: null })).toEqual(['x -5.0–16.4 ft']);
  });
});

describe('range labels: z, y, x order, with an en dash (U+2013) between values', () => {
  it('all three axes narrowed gives STA, EL, x (ft) in that order', () => {
    const labels = clipLabels({
      z: [zOf(10500), zOf(10600)],
      y: [yOf(415), yOf(425)],
      x: [-10 * FT, 10 * FT],
    });
    expect(labels).toEqual(['STA 105+00.0–106+00.0', 'EL 415.0–425.0 ft', 'x -10.0–10.0 ft']);
  });

  it('narrowing only the whole Span B (Bent 2 to Bent 3) gives one station range, used as is in a proposal title', () => {
    expect(clipLabels({ x: null, y: null, z: [-13.716, 13.716] })).toEqual(['STA 105+76.0–106+66.0']);
  });

  it('uncut axes are left out', () => {
    expect(clipLabels(NO_CLIP)).toEqual([]);
    expect(clipLabels({ x: [0, 3.048], y: null, z: null })).toEqual(['x 0.0–10.0 ft']);
  });
});
