// ------------------------------------------------------------------
//  GLB loader: do the model path and mesh tagging go through the active bridge profile?
//  Manifest and BW_ grammar mapping.
// ------------------------------------------------------------------
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { bridge } from '@/bridge';
import { tagMeshes } from './loader';

/* Puts one named box mesh in a group and tags it. */
function tagged(group: string, name: string): THREE.Mesh {
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
  mesh.name = name;
  mesh.position.set(0, 0, 3);
  root.add(mesh);
  tagMeshes(root, group, group, new Map([[name, 'EL 1']]), false);
  return mesh;
}

describe('mesh tagging: objectInfo of the active bridge profile', () => {
  it('node name to member info (fine member, objectCode = node name)', () => {
    const m = tagged('BEECHWOOD', 'BW_BEAM_B2');
    expect(m.userData.fine).toBe('PSC bulb-tee beam');
    expect(m.userData.locationDetail).toBe('Span B, beam line 2');
    expect(m.userData.objectId).toBe('BW_BEAM_B2');
    expect(m.userData.el).toBe('EL 1');
    expect(m.userData.group).toBe('BEECHWOOD');
  });

  it('the tagging result always equals the decision of the active profile', () => {
    const [group, name] = ['BEECHWOOD', 'BW_CAP_B3'];
    const m = tagged(group, name);
    const info = bridge.objectInfo(group, name, { x: 0, z: 3 });
    expect([m.userData.fine, m.userData.locationDetail]).toEqual([info.fine, info.locationDetail]);
  });
});

// ------------------------------------------------------------------
//  Picking targets: the ground meshes (BW_GROUND, BW_GROUND_S, BW_GROUND_N) are not members.
//  Model.tsx and the proposal SelectViewer both pick by raycasting the model tagged by loadBridge > tagMeshes,
//  so tagging switches raycast off for the ground. Bridge members stay pickable.
// ------------------------------------------------------------------
/* A named box (1 m) at position x, picked with a ray shot down from above (y=20) */
function boxAt(name: string, x: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
  m.name = name;
  m.position.set(x, 0, 0);
  return m;
}
/* Picks like the app: firstHitOnly (one first intersection per mesh, as in Model.tsx and SelectViewer), shot slightly off an edge */
const pickAt = (root: THREE.Object3D, x: number): string[] => {
  const ray = new THREE.Raycaster(new THREE.Vector3(x + 0.13, 20, 0.21), new THREE.Vector3(0, -1, 0));
  ray.firstHitOnly = true;
  return ray.intersectObject(root, true).map((h) => h.object.name);
};

describe('ground meshes are left out of picking after tagging', () => {
  it.each(['BW_GROUND', 'BW_GROUND_S', 'BW_GROUND_N'])('%s is not hit by raycast (no member info, no damage registration)', (name) => {
    const root = new THREE.Group();
    root.add(boxAt(name, 0), boxAt('BW_DECK_A', 10));
    tagMeshes(root, 'BEECHWOOD', 'BEECHWOOD', new Map(), true);
    expect(pickAt(root, 0)).toEqual([]);
    expect(pickAt(root, 10)).toEqual(['BW_DECK_A']);
    const ground = root.getObjectByName(name)!;
    expect([ground.userData.fine, ground.userData.objectId]).toEqual(['Ground', '']);
  });
});

describe('bridge members are still hit by raycast after tagging', () => {
  it('one member mesh of the active profile', () => {
    const name = 'BW_CAP_B3';
    const root = new THREE.Group();
    root.add(boxAt(name, 0));
    tagMeshes(root, 'BEECHWOOD', 'X', new Map(), true);
    expect(pickAt(root, 0)).toEqual([name]);
  });
});
