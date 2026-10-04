// ------------------------------------------------------------------
//  Orthographic projection + hidden lines: a port of project_view of the pipeline's sheet generator.
//  The same classification rules make a proposed view read with the same lines as the existing sheets
//  (checked against __fixtures__/parity.json, reference counts produced by the generator itself).
//
//  Edge classification (line semantics):
//   - sil    solid: silhouette, exactly one adjacent face is front / the adjacent face of an open edge is front
//   - feat   solid: front feature edge, both faces front + normal difference >= 5 degrees
//   - hidden faint: feature edges with both faces back, back open edges, and solid lines demoted by occlusion.
//            Projected lengths under 0.5 m are dropped (suppresses clutter).
//  front = face normal . N > 1e-6 (a perpendicular face counts as back). Non-manifold edges shared by
//  three or more faces are dropped (the generator's trimesh face_adjacency also pairs two faces only).
//
//  Deliberate differences from the generator:
//   there are no segment-boundary lines, crop_u, clip_overlap or loft-diagonal exceptions, and
//   range cutting is finished by clipMeshes before projectView is called.
// ------------------------------------------------------------------
import { BufferAttribute, BufferGeometry, DoubleSide, Ray } from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import type { Basis } from './basis';
import { faceData } from './faces';
import type { Range5 } from './spec';
import type { ClippedMesh, FaceFilter, Vec3 } from './types';
import { add, dot, length, normalize, scale, sub } from './vec';

/* View-local segment [u0, v0, u1, v1] (m). u = P.U, v = P.V. */
export type Seg = [number, number, number, number];

export interface Projection {
  sil: Seg[];
  feat: Seg[];
  hidden: Seg[];
  range: Range5;
}

/* Occlusion tester: does a ray shot from origin along dir hit anything. */
export interface Occluder {
  hitsAny(origin: Vec3, dir: Vec3): boolean;
}

const FEATURE_ANGLE_RAD = (5 * Math.PI) / 180 - 1e-9; // the generator's FEATURE_ANGLE_DEG - 1e-9
const HIDDEN_MIN_LEN = 0.5; // m; minimum projected length of a hidden line
const DEDUPE_MIN_LEN = 0.02; // m; minimum projected length of a solid line
const JOIN_TOL = 2e-3; // m; gap bridged when merging collinear segments
const OCC_RAY_OFFSET = 0.02; // m; start offset of an occlusion ray (+N), avoids re-hitting its own face
const OCC_SAMPLES = [0.25, 0.5, 0.75]; // three points on an edge; all must be blocked to demote it to hidden
const FRONT_EPS = 1e-6;
const FILTER_SLACK_DEG = 0.5; // slack angle of the face filter, so boundary faces do not flicker between views
const FILTER_AXIS_DOT = 0.7; // an end face with no defined azimuth when |n.axis| is at least this

function round(x: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(x * f) / f;
}

/* Azimuth face filter: is the axis-orthogonal component of the normal within halfDeg (+slack) of center. */
export function passesFilter(normal: Vec3, f: FaceFilter): boolean {
  const axis = normalize(f.axis);
  const along = dot(normal, axis);
  if (Math.abs(along) >= FILTER_AXIS_DOT) return false; // end cap: no defined azimuth
  const perp = sub(normal, scale(axis, along)); // axis-orthogonal component of the normal = azimuth direction
  if (length(perp) < 1e-12 || length(f.center) < 1e-12) return false;
  const ang = Math.acos(Math.min(1, Math.max(-1, dot(normalize(perp), normalize(f.center)))));
  return ang <= ((f.halfDeg + FILTER_SLACK_DEG) * Math.PI) / 180;
}

/* Merges all meshes (before the face filter) into one BVH; without faces nothing is ever hit. */
export function buildOccluder(meshes: ClippedMesh[]): Occluder {
  let vTotal = 0;
  let iTotal = 0;
  for (const m of meshes) {
    vTotal += m.positions.length / 3;
    iTotal += m.faces.length;
  }
  if (iTotal === 0) return { hitsAny: () => false };

  const position = new Float32Array(vTotal * 3);
  const index = new Uint32Array(iTotal);
  let vOff = 0;
  let iOff = 0;
  for (const m of meshes) {
    position.set(m.positions, vOff * 3);
    for (let i = 0; i < m.faces.length; i++) index[iOff + i] = m.faces[i]! + vOff;
    vOff += m.positions.length / 3;
    iOff += m.faces.length;
  }

  const geom = new BufferGeometry();
  geom.setAttribute('position', new BufferAttribute(position, 3));
  geom.setIndex(new BufferAttribute(index, 1));
  const bvh = new MeshBVH(geom);
  const ray = new Ray();

  return {
    hitsAny(origin, dir) {
      ray.origin.set(origin[0], origin[1], origin[2]);
      ray.direction.set(dir[0], dir[1], dir[2]);
      // Double-sided: faces leaving from the inside count as occluders too (inner walls of a hollow section).
      return bvh.raycastFirst(ray, DoubleSide) != null;
    },
  };
}

/* A solid-line candidate for the occlusion test: projected segment + the 3D end points to shoot rays from. */
interface Candidate {
  seg: Seg;
  a0: Vec3;
  a1: Vec3;
}

function vertexAt(m: ClippedMesh, i: number): Vec3 {
  return [m.positions[3 * i]!, m.positions[3 * i + 1]!, m.positions[3 * i + 2]!];
}

/**
 * Projects the meshes orthographically onto the (U,V) plane and classifies edges as solid/feature/hidden.
 * With a faceFilter only faces that pass are used; null when no face is left.
 */
export function projectView(
  meshes: ClippedMesh[],
  b: Basis,
  opts?: { faceFilter?: FaceFilter | null; occluder?: Occluder | null },
): Projection | null {
  const filter = opts?.faceFilter ?? null;
  const occluder = opts?.occluder ?? null;

  const cand: Record<'sil' | 'feat', Candidate[]> = { sil: [], feat: [] };
  const rawHidden: Seg[] = [];
  let umin = Infinity;
  let umax = -Infinity;
  let vmin = Infinity;
  let vmax = -Infinity;
  let nmax = -Infinity;
  let anyFace = false;

  for (const m of meshes) {
    const fd = faceData(m);
    const faceCount = m.faces.length / 3;

    // (1) Face filter: keep only the faces that pass.
    const keep: number[] = [];
    for (let f = 0; f < faceCount; f++) {
      const n: Vec3 = [fd.normals[3 * f]!, fd.normals[3 * f + 1]!, fd.normals[3 * f + 2]!];
      if (!filter || passesFilter(n, filter)) keep.push(f);
    }
    if (keep.length === 0) continue;
    anyFace = true;

    // (2) Range: only vertices actually used by the remaining faces count.
    const vCount = m.positions.length / 3;
    const used = new Uint8Array(vCount);
    for (const f of keep) {
      used[m.faces[3 * f]!] = 1;
      used[m.faces[3 * f + 1]!] = 1;
      used[m.faces[3 * f + 2]!] = 1;
    }
    const du = new Float64Array(vCount);
    const dv = new Float64Array(vCount);
    for (let i = 0; i < vCount; i++) {
      const p = vertexAt(m, i);
      du[i] = dot(p, b.U);
      dv[i] = dot(p, b.V);
      if (!used[i]) continue;
      const n = dot(p, b.N);
      if (du[i]! < umin) umin = du[i]!;
      if (du[i]! > umax) umax = du[i]!;
      if (dv[i]! < vmin) vmin = dv[i]!;
      if (dv[i]! > vmax) vmax = dv[i]!;
      if (n > nmax) nmax = n;
    }

    // (3) Edge map: key = min x vCount + max, value = list of faces sharing the edge.
    //    (within the MAX_TRIANGLES cap vCount squared is far below 2^53, so key and inverse are exact)
    const edges = new Map<number, number[]>();
    const addEdge = (i: number, j: number, f: number): void => {
      const key = i < j ? i * vCount + j : j * vCount + i;
      const at = edges.get(key);
      if (at) at.push(f);
      else edges.set(key, [f]);
    };
    for (const f of keep) {
      const i0 = m.faces[3 * f]!, i1 = m.faces[3 * f + 1]!, i2 = m.faces[3 * f + 2]!;
      addEdge(i0, i1, f);
      addEdge(i1, i2, f);
      addEdge(i2, i0, f);
    }

    const front = (f: number): boolean =>
      fd.normals[3 * f]! * b.N[0] + fd.normals[3 * f + 1]! * b.N[1] + fd.normals[3 * f + 2]! * b.N[2] > FRONT_EPS;
    const put = (kind: 'sil' | 'feat' | 'hidden', i: number, j: number): void => {
      const seg: Seg = [du[i]!, dv[i]!, du[j]!, dv[j]!];
      if (kind === 'hidden') rawHidden.push(seg);
      else cand[kind].push({ seg, a0: vertexAt(m, i), a1: vertexAt(m, j) });
    };

    // Inner edges (2 adjacent faces) then open edges (1 adjacent face), in the generator's order.
    // Both loops pick only edges with the matching count, so edges of three or more faces (non-manifold) are dropped.
    for (const [key, fs] of edges) {
      if (fs.length !== 2) continue;
      const i = Math.floor(key / vCount), j = key % vCount;
      const nf = (front(fs[0]!) ? 1 : 0) + (front(fs[1]!) ? 1 : 0);
      if (nf === 1) {
        put('sil', i, j);
        continue;
      }
      const c = fd.normals[3 * fs[0]!]! * fd.normals[3 * fs[1]!]!
        + fd.normals[3 * fs[0]! + 1]! * fd.normals[3 * fs[1]! + 1]!
        + fd.normals[3 * fs[0]! + 2]! * fd.normals[3 * fs[1]! + 2]!;
      if (Math.acos(Math.min(1, Math.max(-1, c))) >= FEATURE_ANGLE_RAD) put(nf === 2 ? 'feat' : 'hidden', i, j);
    }
    for (const [key, fs] of edges) {
      if (fs.length !== 1) continue;
      const i = Math.floor(key / vCount), j = key % vCount;
      put(front(fs[0]!) ? 'sil' : 'hidden', i, j);
    }
  }

  if (!anyFace) return null;

  // (4) Occlusion: an edge whose three +N rays are all blocked is demoted to a hidden line.
  const out: Record<'sil' | 'feat', Seg[]> = { sil: [], feat: [] };
  for (const kind of ['sil', 'feat'] as const) {
    const visible: Seg[] = [];
    for (const { seg, a0, a1 } of cand[kind]) {
      let blocked = false;
      if (occluder) {
        blocked = true;
        const d = sub(a1, a0);
        for (const t of OCC_SAMPLES) {
          const origin = add(add(a0, scale(d, t)), scale(b.N, OCC_RAY_OFFSET));
          if (!occluder.hitsAny(origin, b.N)) {
            blocked = false;
            break;
          }
        }
      }
      if (blocked) rawHidden.push(seg);
      else visible.push(seg);
    }
    out[kind] = dedupe(visible, DEDUPE_MIN_LEN);
  }

  return {
    sil: out.sil,
    feat: out.feat,
    hidden: mergeCollinear(rawHidden, HIDDEN_MIN_LEN),
    range: [umin, umax, vmin, vmax, nmax],
  };
}

/* Drops short segments (minLen) and duplicates, like the generator's `_dedupe`. The key rounds end points to 3 decimals. */
function dedupe(segs: Seg[], minLen: number): Seg[] {
  const seen = new Set<string>();
  const out: Seg[] = [];
  for (const s of segs) {
    if (Math.hypot(s[2] - s[0], s[3] - s[1]) < minLen) continue;
    const p = `${round(s[0], 3)},${round(s[1], 3)}`;
    const q = `${round(s[2], 3)},${round(s[3], 3)}`;
    const key = p <= q ? `${p}|${q}` : `${q}|${p}`; // key independent of end point order
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/**
 * Merges collinear segments (on the same line) into maximal spans and drops those under minLen, like the generator's `_merge_collinear`.
 * Makes one line of a projected line that several triangles produce on top of each other (section cap diagonals and the like).
 */
function mergeCollinear(segs: Seg[], minLen: number, joinTol = JOIN_TOL): Seg[] {
  interface Group {
    ux: number;
    uy: number;
    off: number;
    ivs: Array<[number, number]>;
  }
  const groups = new Map<string, Group>();

  for (const [x0, y0, x1, y1] of segs) {
    const dx = x1 - x0, dy = y1 - y0;
    const L = Math.hypot(dx, dy);
    if (L < 1e-9) continue;
    let ux = dx / L, uy = dy / L;
    if (ux < 0 || (ux === 0 && uy < 0)) {
      ux = -ux;
      uy = -uy;
    }
    const off = x0 * -uy + y0 * ux; // perpendicular offset of the line from the origin
    const key = `${round(Math.atan2(uy, ux), 4)},${round(off, 3)}`;
    let g = groups.get(key);
    if (!g) {
      g = { ux, uy, off, ivs: [] };
      groups.set(key, g);
    }
    const t0 = x0 * ux + y0 * uy, t1 = x1 * ux + y1 * uy;
    g.ivs.push([Math.min(t0, t1), Math.max(t0, t1)]);
  }

  const out: Seg[] = [];
  for (const { ux, uy, off, ivs } of groups.values()) {
    const bx = -uy * off, by = ux * off;
    ivs.sort((a, c) => a[0] - c[0] || a[1] - c[1]);
    let [c0, c1] = ivs[0]!;
    const merged: Array<[number, number]> = [];
    for (let i = 1; i < ivs.length; i++) {
      const [t0, t1] = ivs[i]!;
      if (t0 <= c1 + joinTol) c1 = Math.max(c1, t1);
      else {
        merged.push([c0, c1]);
        c0 = t0;
        c1 = t1;
      }
    }
    merged.push([c0, c1]);
    for (const [t0, t1] of merged) {
      if (t1 - t0 >= minLen) out.push([bx + ux * t0, by + uy * t0, bx + ux * t1, by + uy * t1]);
    }
  }
  return out;
}
