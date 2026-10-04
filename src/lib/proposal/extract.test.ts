import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { extractMeshInput } from './extract';

/* Per-axis [min,max] of positions, to see that the world transform was really applied. */
function range(p: Float32Array | Float64Array, axis: number): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = axis; i < p.length; i += 3) {
    lo = Math.min(lo, p[i]!);
    hi = Math.max(hi, p[i]!);
  }
  return [lo, hi];
}

describe('extractMeshInput', () => {
  it('gives world coordinates with the parent transforms applied', () => {
    // A 1x1x1 box at x=5 under a parent group scaled by 2: world x is in [9, 11]
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.position.set(5, 0, 0);
    const parent = new THREE.Group();
    parent.scale.set(2, 2, 2);
    parent.add(mesh);

    const out = extractMeshInput(mesh);

    expect(range(out.positions, 0)).toEqual([9, 11]);
    expect(range(out.positions, 1)).toEqual([-1, 1]);
    expect(range(out.positions, 2)).toEqual([-1, 1]);
    expect(out.positions.length).toBe(24 * 3);
    expect(out.indices.length).toBe(36);
  });

  it('copies objName, objectId and fine from userData as they are', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.name = 'node-name';
    mesh.userData = { objectId: 'BW_COL_B2_1', fine: 'Column', objName: 'BW_COL_B2_1_W' };

    expect(extractMeshInput(mesh)).toMatchObject({
      name: 'BW_COL_B2_1_W',
      objectId: 'BW_COL_B2_1',
      fine: 'Column',
    });
  });

  it('with empty userData name is mesh.name and objectId and fine are empty strings', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.name = 'node-name';

    expect(extractMeshInput(mesh)).toMatchObject({ name: 'node-name', objectId: '', fine: '' });
  });

  it('reads a normalized Int16 position as floating-point values too (32767 gives 1)', () => {
    // A meshopt-quantized attribute: reading the array directly would give 32767 and wreck the coordinates.
    const geom = new THREE.BufferGeometry();
    geom.setAttribute(
      'position',
      new THREE.BufferAttribute(new Int16Array([32767, 0, 0, 0, 32767, 0, 0, 0, 32767]), 3, true),
    );

    const out = extractMeshInput(new THREE.Mesh(geom));

    expect(Array.from(out.positions)).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    expect(Array.from(out.indices)).toEqual([0, 1, 2]);
  });

  it('numbers a geometry without an index 0..n-1', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1).toNonIndexed());

    const out = extractMeshInput(mesh);

    expect(out.positions.length).toBe(36 * 3);
    expect(out.indices.length).toBe(36);
    expect(Array.from(out.indices.slice(0, 4))).toEqual([0, 1, 2, 3]);
  });
});
