import { describe, expect, it } from 'vitest';
import { box } from './__fixtures__/shapes';
import { boundsOf, clipMeshes, isBoltMesh, triangleCount } from './clip';
import { NO_CLIP } from './types';

describe('clipMeshes', () => {
  const slab = box([-10, 0, 0], [10, 1, 40], 'slab');
  it('without cutting: 12 faces, merged to 8 vertices', () => {
    const [m] = clipMeshes([slab], NO_CLIP);
    expect(triangleCount([m!])).toBe(12);
    expect(m!.positions.length / 3).toBe(8);
    expect(boundsOf([m!])).toEqual({ min: [-10, 0, 0], max: [10, 1, 40] });
  });
  it('filters by face center (the default clip of the generator)', () => {
    const [m] = clipMeshes([slab], { x: null, y: [0.9, 2], z: null });   // top face only (center y=1)
    expect(triangleCount([m!])).toBe(2);
  });
  it('drops a mesh with no faces left, and drops bolt meshes from the input', () => {
    expect(clipMeshes([slab], { x: [100, 200], y: null, z: null })).toEqual([]);
    expect(isBoltMesh('BW_XF_B::BoltT_12')).toBe(true);
    expect(clipMeshes([box([0, 0, 0], [1, 1, 1], 'X_BoltF_1')], NO_CLIP)).toEqual([]);
  });
});
