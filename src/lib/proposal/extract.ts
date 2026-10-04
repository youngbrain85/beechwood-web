// ------------------------------------------------------------------
//  three meshes to engine input (MeshInput).
//
//  The engine (clip, faces, project) is pure TS that handles **world-coordinate triangles** only,
//  so the node transforms and quantized attributes of three are all resolved here.
//   - Node transforms: a GLB has scale and translation on its group and scene nodes; passing local
//     coordinates as they are would put members in the wrong place. matrixWorld is applied.
//   - Quantization: position of a meshopt-compressed GLB is a normalized Int16. Reading the array
//     directly gives integers like 32767; getX/getY/getZ must be used so that
//     three returns the denormalized floats.
//  The result is new Float32Array/Uint32Array data that shares no buffer with the source
//  (transferring it to a worker does not damage the scene geometry).
// ------------------------------------------------------------------
import * as THREE from 'three';
import type { MeshInput } from './types';

/* Reused vector for vertex transforms; this runs tens of thousands of times per mesh, so no new objects. */
const scratch = new THREE.Vector3();

/* One three mesh to a world-coordinate MeshInput. Without an index it is numbered 0..n-1. */
export function extractMeshInput(mesh: THREE.Mesh): MeshInput {
  // Updates up through the parents (children are not needed); this one line also settles a group not attached to a scene.
  mesh.updateWorldMatrix(true, false);
  const world = mesh.matrixWorld;

  const pos = mesh.geometry.getAttribute('position');
  const count = pos.count;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    scratch.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(world);
    positions[i * 3] = scratch.x;
    positions[i * 3 + 1] = scratch.y;
    positions[i * 3 + 2] = scratch.z;
  }

  const index = mesh.geometry.getIndex();
  let indices: Uint32Array;
  if (index) {
    indices = new Uint32Array(index.count);
    for (let i = 0; i < index.count; i += 1) indices[i] = index.getX(i);
  } else {
    indices = new Uint32Array(count);
    for (let i = 0; i < count; i += 1) indices[i] = i;
  }

  const ud = mesh.userData as { objName?: string; objectId?: string; fine?: string };
  return {
    name: ud.objName ?? mesh.name,
    objectId: ud.objectId ?? '',
    fine: ud.fine ?? '',
    positions,
    indices,
  };
}
