import { describe, expect, it } from 'vitest';
import { box, cylinderY } from './__fixtures__/shapes';
import { clipMeshes } from './clip';
import { analyze, faceData, shareToward } from './faces';
import { NO_CLIP } from './types';

const clipped = (m: Parameters<typeof clipMeshes>[0]) => clipMeshes(m, NO_CLIP);

describe('faceData', () => {
  it('box: areas sum to the surface area; cylinder: normals point away from the axis', () => {
    expect(faceData(clipped([box([0, 0, 0], [2, 3, 4])])[0]!).total).toBeCloseTo(2 * (6 + 8 + 12), 9);
    const c = clipped([cylinderY(5, 7, 1.25, 0, 10)])[0]!;
    const fd = faceData(c);
    for (let i = 0; i < fd.areas.length; i++) {
      const dx = fd.centroids[3 * i]! - 5, dz = fd.centroids[3 * i + 2]! - 7;
      expect(fd.normals[3 * i]! * dx + fd.normals[3 * i + 2]! * dz).toBeGreaterThan(0);
    }
  });
});

describe('analyze', () => {
  it('slab: +-Y at 46.5% each, main axis Z, elongation 2', () => {
    const a = analyze(clipped([box([-10, 0, 0], [10, 1, 40])]));
    expect(a.clusters.slice(0, 2).map((c) => c.normal)).toEqual([[0, -1, 0], [0, 1, 0]]);   // the soffit first on a tie
    expect(a.clusters[0]!.share).toBeCloseTo(800 / 1720, 6);
    expect(a.axis.map(Math.abs)).toEqual([0, 0, 1]);
    expect(a.elongation).toBeCloseTo(2, 6);
    expect(a.cylinder).toBeNull();
  });
  it('column box: main axis Y, elongation 5, the four tied side clusters in the order -X, +X, -Z, +Z', () => {
    const a = analyze(clipped([box([-1, 0, -1], [1, 10, 1])]));
    expect(a.axis.map(Math.abs)).toEqual([0, 1, 0]);
    expect(a.elongation).toBeCloseTo(5, 6);
    expect(a.clusters.slice(0, 4).map((c) => c.normal)).toEqual([[-1, 0, 0], [1, 0, 0], [0, 0, -1], [0, 0, 1]]);
  });
  it('cylinder: at least 8 side clusters, none above 20%, so cylindrical, radius 1.25', () => {
    const a = analyze(clipped([cylinderY(0, 0, 1.25, 0, 30)]));
    expect(a.cylinder?.radius).toBeCloseTo(1.25, 2);
  });
  it('two separate cylinders: clusters and circular variance pass, but the distances to the axis are uneven, so not a cylinder', () => {
    // The case where twin legs spread apart were mistaken for a "cylinder": the coefficient of variation of the face-center distances to the axis is about 0.125.
    const a = analyze(clipped([
      cylinderY(-7, 0, 1.25, 0, 30, 32, 'L'),
      cylinderY(7, 0, 1.25, 0, 30, 32, 'R'),
    ]));
    expect(a.cylinder).toBeNull();
  });
  it('shareToward: the area share of faces with n.N >= 0.5', () => {
    expect(shareToward(clipped([box([-10, 0, 0], [10, 1, 40])]), [0, 1, 0])).toBeCloseTo(800 / 1720, 6);
  });
});
