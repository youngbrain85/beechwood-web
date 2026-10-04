// ------------------------------------------------------------------
//  Range cutting: cuts world-coordinate meshes (MeshInput[]) by per-axis ranges (ClipBox)
//  and builds ClippedMesh[] holding only the vertices still in use.
//
//  Rules:
//   (1) meshes with "bolt" in the name are excluded at input
//   (2) a face is kept when the mean of its three vertices (the face center) is inside every axis range (+-1e-6)
//   (3) degenerate faces with area < 1e-12 are excluded
//   (4) only the vertices of the remaining faces are kept, merged (welded) by a key of coordinates
//     rounded to 1e-8 and re-indexed, so that coincident vertices are not counted twice by the
//     clustering and PCA of faces.ts
//   (5) meshes with no faces left are excluded from the result
// ------------------------------------------------------------------
import type { ClipBox, ClippedMesh, MeshInput, Vec3 } from './types';
import { cross, sub } from './vec';

const CLIP_EPS = 1e-6;
const MIN_AREA = 1e-12;
const WELD_SCALE = 1e8;

/* Meshes with "bolt" in the name (case-insensitive); bolts are not drawn on inspection sheets. */
export function isBoltMesh(name: string): boolean {
  return /bolt/i.test(name);
}

function inRange(v: number, range: [number, number] | null): boolean {
  if (!range) return true;
  return v >= range[0] - CLIP_EPS && v <= range[1] + CLIP_EPS;
}

function readVec3(pos: Float32Array | Float64Array, i: number): Vec3 {
  return [pos[3 * i]!, pos[3 * i + 1]!, pos[3 * i + 2]!];
}

function weldKey(p: Vec3): string {
  return `${Math.round(p[0] * WELD_SCALE)},${Math.round(p[1] * WELD_SCALE)},${Math.round(p[2] * WELD_SCALE)}`;
}

/* Cuts the mesh list by the clip range into merged ClippedMesh[] (bolts and empty results excluded). */
export function clipMeshes(meshes: MeshInput[], clip: ClipBox): ClippedMesh[] {
  const out: ClippedMesh[] = [];

  for (const mesh of meshes) {
    if (isBoltMesh(mesh.name)) continue;

    const weldMap = new Map<string, number>();
    const newPositions: number[] = [];
    const newFaces: number[] = [];

    const weldVertex = (p: Vec3): number => {
      const key = weldKey(p);
      const found = weldMap.get(key);
      if (found !== undefined) return found;
      const idx = newPositions.length / 3;
      newPositions.push(p[0], p[1], p[2]);
      weldMap.set(key, idx);
      return idx;
    };

    for (let f = 0; f < mesh.indices.length; f += 3) {
      const ia = mesh.indices[f]!, ib = mesh.indices[f + 1]!, ic = mesh.indices[f + 2]!;
      const a = readVec3(mesh.positions, ia);
      const b = readVec3(mesh.positions, ib);
      const c = readVec3(mesh.positions, ic);

      const center: Vec3 = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
      if (!inRange(center[0], clip.x) || !inRange(center[1], clip.y) || !inRange(center[2], clip.z)) continue;

      const cr = cross(sub(b, a), sub(c, a));
      const area = Math.sqrt(cr[0] * cr[0] + cr[1] * cr[1] + cr[2] * cr[2]) / 2;
      if (area < MIN_AREA) continue;

      newFaces.push(weldVertex(a), weldVertex(b), weldVertex(c));
    }

    if (newFaces.length === 0) continue;

    out.push({ name: mesh.name, positions: new Float64Array(newPositions), faces: new Uint32Array(newFaces) });
  }

  return out;
}

/* Total triangle count. */
export function triangleCount(meshes: ClippedMesh[]): number {
  let n = 0;
  for (const m of meshes) n += m.faces.length / 3;
  return n;
}

/* Per-axis minimum and maximum over all vertices; null without meshes or vertices. */
export function boundsOf(meshes: ClippedMesh[]): { min: Vec3; max: Vec3 } | null {
  let min: Vec3 | null = null;
  let max: Vec3 | null = null;

  for (const m of meshes) {
    for (let i = 0; i < m.positions.length; i += 3) {
      const x = m.positions[i]!, y = m.positions[i + 1]!, z = m.positions[i + 2]!;
      if (!min || !max) {
        min = [x, y, z];
        max = [x, y, z];
        continue;
      }
      if (x < min[0]) min[0] = x; if (x > max[0]) max[0] = x;
      if (y < min[1]) min[1] = y; if (y > max[1]) max[1] = y;
      if (z < min[2]) min[2] = z; if (z > max[2]) max[2] = z;
    }
  }

  return min && max ? { min, max } : null;
}
