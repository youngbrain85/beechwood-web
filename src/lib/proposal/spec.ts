// ------------------------------------------------------------------
//  View spec contract: the same fields and rounding rules as make_view_spec of the pipeline's sheet generator
//  (downstream outputs must match number for number for comparison and regression checks). origin is
//  derived from the view basis (U,V,N) and the (u,v,n) range, and uvToWorld/worldToUv are the round-trip
//  conversions relative to that origin.
// ------------------------------------------------------------------
import type { FaceFilter, Vec3 } from './types';
import { add, dot, scale, sub } from './vec';
import type { Basis } from './basis';

/* [umin, umax, vmin, vmax, nmax]: u and v are the view-plane range, nmax the offset along the normal from the inspected face. */
export type Range5 = [number, number, number, number, number];

export interface ViewSpec {
  id: string;
  label: string;
  origin: Vec3;
  u: Vec3;
  v: Vec3;
  normal: Vec3;
  extent_m: [number, number];
  placement: [number, number, number, number];
  mirrored: boolean;
  face_filter: FaceFilter | null;
  clip?: Record<string, [number, number]>;
}

/* Rounds to n decimals, turning -0 into 0 (must equal the generator output byte for byte). */
function round(x: number, decimals: number): number {
  const f = 10 ** decimals;
  const r = Math.round(x * f) / f;
  return r === 0 ? 0 : r;
}

const round4 = (x: number): number => round(x, 4);
const round5 = (x: number): number => round(x, 5);

export function makeViewSpec(
  id: string,
  label: string,
  b: Basis,
  range: Range5,
  placement: [number, number, number, number],
  extra?: Partial<ViewSpec>,
): ViewSpec {
  const [umin, umax, vmin, vmax, nmax] = range;

  // origin = U x umin + V x vmin + N x nmax: where the view plane (u=v=0) sits in world coordinates.
  const originRaw = add(add(scale(b.U, umin), scale(b.V, vmin)), scale(b.N, nmax));
  const origin: Vec3 = [round4(originRaw[0]), round4(originRaw[1]), round4(originRaw[2])];
  const extent_m: [number, number] = [round4(umax - umin), round4(vmax - vmin)];
  const roundedPlacement: [number, number, number, number] = [
    round5(placement[0]),
    round5(placement[1]),
    round5(placement[2]),
    round5(placement[3]),
  ];

  return {
    id,
    label,
    origin,
    u: b.U,
    v: b.V,
    normal: b.N,
    extent_m,
    placement: roundedPlacement,
    mirrored: b.mirrored,
    face_filter: null,
    ...extra,
  };
}

/* (u,v) in [0,1] to world coordinates: the point reached from origin by extent_m along U and V. */
export function uvToWorld(v: Pick<ViewSpec, 'origin' | 'u' | 'v' | 'extent_m'>, u: number, vv: number): Vec3 {
  return add(add(v.origin, scale(v.u, u * v.extent_m[0])), scale(v.v, vv * v.extent_m[1]));
}

/* World coordinates to (u,v,d). d is the offset from the inspected face (along N), 0 for a point on the face. */
export function worldToUv(
  v: Pick<ViewSpec, 'origin' | 'u' | 'v' | 'normal' | 'extent_m'>,
  p: Vec3,
): { u: number; v: number; d: number } {
  const rel = sub(p, v.origin);
  return {
    u: dot(rel, v.u) / v.extent_m[0],
    v: dot(rel, v.v) / v.extent_m[1],
    d: dot(rel, v.normal),
  };
}
