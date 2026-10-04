import { describe, expect, it } from 'vitest';
import { box, cylinderY } from './__fixtures__/shapes';
import { clipMeshes } from './clip';
import { coverage } from './score';
import { NO_CLIP, type FaceFilter, type Vec3 } from './types';

const quarter = (center: Vec3): FaceFilter => ({ kind: 'azimuth', axis: [0, 1, 0], center, halfDeg: 45 });
const QUADRANTS: Vec3[] = [[0, 0, -1], [1, 0, 0], [0, 0, 1], [-1, 0, 0]];

describe('coverage: share of the surface area a candidate covers', () => {
  // A 20x1x40 slab: top and bottom 800 sq m each, sides 20, 20, 40, 40, total 1720 sq m.
  const slab = clipMeshes([box([-10, 0, 0], [10, 1, 40])], NO_CLIP);

  it('one top view covers the top area only', () => {
    expect(coverage(slab, [{ normal: [0, 1, 0], faceFilter: null }])).toBeCloseTo(800 / 1720, 12);
  });

  it('top and soffit views cover the union of the two faces', () => {
    expect(
      coverage(slab, [
        { normal: [0, 1, 0], faceFilter: null },
        { normal: [0, -1, 0], faceFilter: null },
      ]),
    ).toBeCloseTo(1600 / 1720, 12);
  });

  it('the four-quadrant development of a cylinder covers the whole side', () => {
    const cyl = clipMeshes([cylinderY(0, 0, 1.25, 0, 30)], NO_CLIP);
    expect(coverage(cyl, QUADRANTS.map((n) => ({ normal: n, faceFilter: quarter(n) })))).toBeCloseTo(1, 6);
  });

  it('faces rejected by the face filter are not covered: one quadrant view is exactly 1/4', () => {
    const cyl = clipMeshes([cylinderY(0, 0, 1.25, 0, 30)], NO_CLIP);
    const one: Vec3 = [1, 0, 0];
    // Ignoring the filter would count up to 60 degrees (10/32) and give 0.3125; only faces actually drawn may count.
    expect(coverage(cyl, [{ normal: one, faceFilter: quarter(one) }])).toBeCloseTo(0.25, 12);
  });
});
