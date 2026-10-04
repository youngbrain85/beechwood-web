// ------------------------------------------------------------------
//  Minimal 3D vector helpers shared by clip.ts (triangle areas), faces.ts (normals, clusters, main axis),
//  basis.ts (view basis) and spec.ts (view spec coordinate conversions).
//  A private module: outside proposal/ it is reachable only through the APIs the other modules expose.
// ------------------------------------------------------------------
import type { Vec3 } from './types';

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function length(a: Vec3): number {
  return Math.sqrt(dot(a, a));
}

/* Returns [0,0,0] for a zero vector (length about 0); never divides by zero. */
export function normalize(a: Vec3): Vec3 {
  const len = length(a);
  return len > 1e-15 ? [a[0] / len, a[1] / len, a[2] / len] : [0, 0, 0];
}

/* Normalizes -0 to 0; vitest toEqual treats -0 and 0 as different values. */
export function cleanZero(a: Vec3): Vec3 {
  return [a[0] === 0 ? 0 : a[0], a[1] === 0 ? 0 : a[1], a[2] === 0 ? 0 : a[2]];
}

/* Snaps components with magnitude below eps to 0 (including -0), to remove the residual error of orthogonalization in basis.ts. */
export function snapZero(a: Vec3, eps = 1e-12): Vec3 {
  return [Math.abs(a[0]) < eps ? 0 : a[0], Math.abs(a[1]) < eps ? 0 : a[1], Math.abs(a[2]) < eps ? 0 : a[2]];
}
