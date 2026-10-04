// ------------------------------------------------------------------
//  Synthetic shape fixtures for the clip.ts and faces.ts tests (simple shapes whose answers can be worked out by hand).
// ------------------------------------------------------------------
import type { MeshInput, Vec3 } from '../types';

/* Axis-aligned box: 12 faces, outward normals (CCW) */
export function box(min: Vec3, max: Vec3, name = 'box'): MeshInput {
  const [x0, y0, z0] = min, [x1, y1, z1] = max;
  const p = [x0,y0,z0, x1,y0,z0, x1,y1,z0, x0,y1,z0, x0,y0,z1, x1,y0,z1, x1,y1,z1, x0,y1,z1];
  const f = [0,2,1, 0,3,2,  4,5,6, 4,6,7,  0,1,5, 0,5,4,  3,7,6, 3,6,2,  0,4,7, 0,7,3,  1,2,6, 1,6,5];
  return { name, objectId: name, fine: 'Accessory', positions: new Float64Array(p), indices: new Uint32Array(f) };
}
/* Cylinder along the y axis (side faces only), seg-sided */
export function cylinderY(cx: number, cz: number, r: number, y0: number, y1: number, seg = 32, name = 'cyl'): MeshInput {
  const p: number[] = [], f: number[] = [];
  for (let i = 0; i < seg; i++) {
    const a = (2 * Math.PI * i) / seg;
    p.push(cx + r * Math.cos(a), y0, cz + r * Math.sin(a), cx + r * Math.cos(a), y1, cz + r * Math.sin(a));
  }
  for (let i = 0; i < seg; i++) {
    const a = 2 * i, b = 2 * ((i + 1) % seg);
    f.push(a, a + 1, b + 1, a, b + 1, b);   // outward normals
  }
  return { name, objectId: name, fine: 'Substructure', positions: new Float64Array(p), indices: new Uint32Array(f) };
}
/* Transforms by a 4x4 matrix (16 values, column-major) */
export function transformed(m: MeshInput, mat: number[]): MeshInput {
  const out = new Float64Array(m.positions.length);
  for (let i = 0; i < m.positions.length; i += 3) {
    const x = m.positions[i]!, y = m.positions[i + 1]!, z = m.positions[i + 2]!;
    out[i] = mat[0]! * x + mat[4]! * y + mat[8]! * z + mat[12]!;
    out[i + 1] = mat[1]! * x + mat[5]! * y + mat[9]! * z + mat[13]!;
    out[i + 2] = mat[2]! * x + mat[6]! * y + mat[10]! * z + mat[14]!;
  }
  return { ...m, positions: out };
}
