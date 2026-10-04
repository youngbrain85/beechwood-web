// ------------------------------------------------------------------
//  View basis convention: from the face normal N, fixes the screen axes U (right) and V (down).
//  It follows the rules of the pipeline's sheet generator: the start station is on the
//  left and "down" on paper is "down" in the world, so a proposed view reads in the same
//  direction as the existing sheets.
//
//  For horizontal faces (top, soffit) the longitudinal direction (+Z) is to the right: U=+Z, and V is chosen
//  so that west to east runs down the page. For vertical and inclined faces V is "down" made orthogonal to N
//  and U=VxN, with the sign set so that a face looking along the bridge has U toward +X (the viewer is assumed
//  to stand on the west, +Z side). mirrored tells whether UxV points the same way as N (a layout seen from behind).
// ------------------------------------------------------------------
import type { Vec3 } from './types';
import { cross, dot, normalize, scale, snapZero, sub } from './vec';

export interface Basis {
  U: Vec3;
  V: Vec3;
  N: Vec3;
  mirrored: boolean;
}

const Y: Vec3 = [0, 1, 0];
const Z: Vec3 = [0, 0, 1];

export function viewBasis(Nin: Vec3): Basis {
  const N = normalize(Nin);
  let U: Vec3, V: Vec3;

  if (Math.abs(dot(N, Y)) >= Math.SQRT1_2) {
    // Horizontal faces (top, soffit): U is the projection toward +Z; V is orthogonal to U and N with west to east running down the page.
    U = normalize(sub(Z, scale(N, dot(Z, N))));
    V = cross(N, U);
    if (V[0] < 0) V = scale(V, -1); // west to east runs down the page
  } else {
    // Vertical and inclined faces: V is "down" (-Y) made orthogonal to N, and U=VxN.
    const down = scale(Y, -1);
    V = normalize(sub(down, scale(N, dot(down, N))));
    U = cross(V, N);
    const key = Math.abs(U[2]) > 0.1 ? U[2] : U[0]; // +X for faces looking along the bridge, otherwise by the sign of U[2]
    if (key < 0) U = scale(U, -1);
  }

  const c = cross(U, V);
  return { U: snapZero(U), V: snapZero(V), N: snapZero(N), mirrored: dot(c, N) > 0 };
}

/**
 * View label table — the **stored value** of a proposal view (ViewSpec.label). The bridge profile
 * supplies it (proposal.viewLabels) and the proposal engine hands it to the compositions (compositions.ts).
 */
export interface ViewLabelSet {
  /* Names of the six axis directions, in AXES order (+Y, -Y, -X, +X, -Z, +Z) */
  axes: readonly [string, string, string, string, string, string];
  /* A face not within 20 degrees of any of the six axes; numbered from 1 per composition */
  oblique(n: number): string;
  /* Four-quadrant development of a cylinder with a vertical axis, in the filter-center order [-Z, +X, +Z, -X] */
  cylinder: readonly [string, string, string, string];
  /* Four-quadrant development of a cylinder with an inclined axis: quadrants 1-4 */
  quadrants: readonly [string, string, string, string];
}

// Priority of the six axes: the name of the first axis with dot >= cos 20 degrees (the axes are 90 degrees apart, so no overlap).
const AXES: readonly Vec3[] = [
  [0, 1, 0],
  [0, -1, 0],
  [-1, 0, 0],
  [1, 0, 0],
  [0, 0, -1],
  [0, 0, 1],
];
const COS20 = Math.cos((20 * Math.PI) / 180);

/* A direction name when the normal is within 20 degrees of one of the six axes, otherwise labels.oblique(obliqueIndex). */
export function labelForNormal(N: Vec3, obliqueIndex: number, labels: ViewLabelSet): string {
  const n = normalize(N);
  for (let i = 0; i < AXES.length; i++) {
    if (dot(n, AXES[i]!) >= COS20) return labels.axes[i]!;
  }
  return labels.oblique(obliqueIndex);
}

/* Rotation by deg degrees about the y axis (right-hand rule): +X turned +90 gives -Z (clockwise seen from above). */
export function rotateAboutY(v: Vec3, deg: number): Vec3 {
  const rad = (deg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
}
