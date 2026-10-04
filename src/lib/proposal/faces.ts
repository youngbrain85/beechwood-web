// ------------------------------------------------------------------
//  Face analysis: extracts normal, area and center from the triangles of ClippedMesh[] (faceData),
//  and for several meshes together gives normal clusters, the main axis (PCA) and the cylinder test (analyze).
//
//  Clusters (deterministic):
//   Faces are scanned in descending area (ties by index); among clusters whose representative direction
//   (the normalized running vector sum) has dot >= cos 15 degrees, the one with the largest dot gets sum += n x area,
//   and a new cluster is made when none qualifies. After all faces are assigned the representatives are
//   normalized, clusters within 15 degrees of each other are merged once more, and one within 5 degrees of a
//   world axis is snapped to it (an integer vector like [0,-1,0], never -0).
//   Order: descending share (rounded to 1e-9), then on ties the priority -Y,+Y,-X,+X,-Z,+Z,
//   then lexicographic (x,y,z) for the rest.
//
//  Main axis: the 3x3 covariance of the merged vertex coordinates is diagonalized by Jacobi rotations (at most 50
//  sweeps, stopping early when the off-diagonal sum of squares < 1e-12) and the eigenvector of the largest eigenvalue
//  is the axis. The sign makes the largest component (by magnitude) positive, with a snap within 5 degrees of a world axis.
//  elongation = sqrt(l1/l2) (Infinity when l2 <= 1e-12).
//
//  Cylinder test: faces nearly perpendicular to the axis L (|n.L| < 0.3) are "side faces". If the side
//  area is at least half the total, there are at least 8 side clusters (those above with |normal.L| < 0.3),
//  none of them has a share above 20%, the azimuths of the side normals are spread evenly with an
//  area-weighted circular variance of at least 0.9, and the **distances from the side face centers to the
//  axis** are even with an area-weighted coefficient of variation of at most 0.08, the shape is a cylinder with
//  radius = median distance of the side vertices to the axis (point on the axis = mean of the side vertices).
//  Without the distance condition a shape that merely surrounds the axis at varying distances, such as
//  two inclined legs, would count as one "cylinder".
// ------------------------------------------------------------------
import type { ClippedMesh, Vec3 } from './types';
import { add, cleanZero, cross, dot, length, normalize, scale, sub } from './vec';

const COS15 = Math.cos((15 * Math.PI) / 180);
const COS5 = Math.cos((5 * Math.PI) / 180);
const SIDE_DOT = 0.3; // a "side face" when |n.axis| is below this
const DIST_CV_MAX = 0.08; // cap on the area-weighted coefficient of variation of side-center distances to the axis

export interface FaceData {
  normals: Float64Array;
  areas: Float64Array;
  centroids: Float64Array;
  total: number;
}

/* Normal, area and center per triangle of one mesh. normal = normalize((b-a)x(c-a)), area = |cross|/2. */
export function faceData(m: ClippedMesh): FaceData {
  const faceCount = m.faces.length / 3;
  const normals = new Float64Array(faceCount * 3);
  const areas = new Float64Array(faceCount);
  const centroids = new Float64Array(faceCount * 3);
  let total = 0;

  for (let f = 0; f < faceCount; f++) {
    const ia = m.faces[3 * f]!, ib = m.faces[3 * f + 1]!, ic = m.faces[3 * f + 2]!;
    const a: Vec3 = [m.positions[3 * ia]!, m.positions[3 * ia + 1]!, m.positions[3 * ia + 2]!];
    const b: Vec3 = [m.positions[3 * ib]!, m.positions[3 * ib + 1]!, m.positions[3 * ib + 2]!];
    const c: Vec3 = [m.positions[3 * ic]!, m.positions[3 * ic + 1]!, m.positions[3 * ic + 2]!];

    const cr = cross(sub(b, a), sub(c, a));
    const len = length(cr);
    areas[f] = len / 2;
    total += len / 2;

    if (len > 1e-15) {
      normals[3 * f] = cr[0] / len;
      normals[3 * f + 1] = cr[1] / len;
      normals[3 * f + 2] = cr[2] / len;
    }

    centroids[3 * f] = (a[0] + b[0] + c[0]) / 3;
    centroids[3 * f + 1] = (a[1] + b[1] + c[1]) / 3;
    centroids[3 * f + 2] = (a[2] + b[2] + c[2]) / 3;
  }

  return { normals, areas, centroids, total };
}

export interface Cluster {
  normal: Vec3;
  area: number;
  share: number;
}

export interface Analysis {
  clusters: Cluster[];
  totalArea: number;
  axis: Vec3;
  elongation: number;
  cylinder: { radius: number } | null;
}

// ---- Internal helpers -----------------------------------------------------

/* The faceData output + the original vertex coordinates (needed for the radius after the side test), bundled per face. */
interface FaceRecord {
  normal: Vec3;
  area: number;
  verts: [Vec3, Vec3, Vec3];
}

/* Gathers the faces of several meshes into one list (order kept: the "by index" tie-break of clustering). */
function collectFaces(meshes: ClippedMesh[]): FaceRecord[] {
  const out: FaceRecord[] = [];
  for (const m of meshes) {
    const fd = faceData(m);
    const faceCount = fd.areas.length;
    for (let i = 0; i < faceCount; i++) {
      const ia = m.faces[3 * i]!, ib = m.faces[3 * i + 1]!, ic = m.faces[3 * i + 2]!;
      out.push({
        normal: [fd.normals[3 * i]!, fd.normals[3 * i + 1]!, fd.normals[3 * i + 2]!],
        area: fd.areas[i]!,
        verts: [
          [m.positions[3 * ia]!, m.positions[3 * ia + 1]!, m.positions[3 * ia + 2]!],
          [m.positions[3 * ib]!, m.positions[3 * ib + 1]!, m.positions[3 * ib + 2]!],
          [m.positions[3 * ic]!, m.positions[3 * ic + 1]!, m.positions[3 * ic + 2]!],
        ],
      });
    }
  }
  return out;
}

function collectVertices(meshes: ClippedMesh[]): Vec3[] {
  const pts: Vec3[] = [];
  for (const m of meshes) {
    for (let i = 0; i < m.positions.length; i += 3) {
      pts.push([m.positions[i]!, m.positions[i + 1]!, m.positions[i + 2]!]);
    }
  }
  return pts;
}

interface ClusterAccum {
  sum: Vec3; // sum of n_i x area_i; the representative direction is normalize(sum)
  area: number; // Σ area_i
}

/* Scans in descending area (ties by index), accumulating into a cluster within 15 degrees of its representative, else a new cluster. */
function clusterFaces(faces: FaceRecord[]): ClusterAccum[] {
  // Array#sort is stable (ES2019+): sorting the indices along keeps the original order on ties.
  const order = faces.map((_, i) => i);
  order.sort((i, j) => faces[j]!.area - faces[i]!.area);

  const clusters: ClusterAccum[] = [];
  for (const i of order) {
    const face = faces[i]!;
    if (face.area <= 0) continue; // defensive (the clip step already drops area < 1e-12)

    let bestIdx = -1;
    let bestDot = -Infinity;
    for (let c = 0; c < clusters.length; c++) {
      const rep = normalize(clusters[c]!.sum);
      const d = dot(rep, face.normal);
      if (d >= COS15 && d > bestDot) {
        bestDot = d;
        bestIdx = c;
      }
    }

    if (bestIdx === -1) {
      clusters.push({ sum: scale(face.normal, face.area), area: face.area });
    } else {
      const cl = clusters[bestIdx]!;
      cl.sum = add(cl.sum, scale(face.normal, face.area));
      cl.area += face.area;
    }
  }
  return clusters;
}

/* Merges clusters within 15 degrees of each other until none can be merged (cleans up leftovers of the online clustering). */
function mergeCloseClusters(clusters: ClusterAccum[]): ClusterAccum[] {
  const list = clusters.map((c): ClusterAccum => ({ sum: [...c.sum] as Vec3, area: c.area }));
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < list.length; i++) {
      const ri = normalize(list[i]!.sum);
      for (let j = i + 1; j < list.length; j++) {
        const rj = normalize(list[j]!.sum);
        if (dot(ri, rj) >= COS15) {
          list[i]!.sum = add(list[i]!.sum, list[j]!.sum);
          list[i]!.area += list[j]!.area;
          list.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }
  return list;
}

const AXES: Vec3[] = [
  [1, 0, 0], [-1, 0, 0],
  [0, 1, 0], [0, -1, 0],
  [0, 0, 1], [0, 0, -1],
];

/* Snaps to the integer axis vector within cos 5 degrees of a world axis, else null (the six axes are 90 degrees apart, so no double match). */
function snapToAxis(v: Vec3): Vec3 | null {
  for (const axis of AXES) {
    if (dot(v, axis) >= COS5) return axis;
  }
  return null;
}

/* Tie priority: -Y,+Y,-X,+X,-Z,+Z. Anything not snapped to an axis is outside the priority (last, lexicographic). */
function axisPriority(n: Vec3): number {
  const order: Vec3[] = [[0, -1, 0], [0, 1, 0], [-1, 0, 0], [1, 0, 0], [0, 0, -1], [0, 0, 1]];
  for (let i = 0; i < order.length; i++) {
    const o = order[i]!;
    if (n[0] === o[0] && n[1] === o[1] && n[2] === o[2]) return i;
  }
  return Number.POSITIVE_INFINITY;
}

function roundShare(s: number): number {
  return Math.round(s / 1e-9) * 1e-9;
}

/* Descending share (rounded to 1e-9), then axis priority (-Y,+Y,-X,+X,-Z,+Z), then lexicographic (x,y,z). */
function compareClusters(a: Cluster, b: Cluster): number {
  const ra = roundShare(a.share), rb = roundShare(b.share);
  if (ra !== rb) return rb - ra;
  const pa = axisPriority(a.normal), pb = axisPriority(b.normal);
  if (pa !== pb) return pa - pb;
  if (a.normal[0] !== b.normal[0]) return a.normal[0] - b.normal[0];
  if (a.normal[1] !== b.normal[1]) return a.normal[1] - b.normal[1];
  return a.normal[2] - b.normal[2];
}

function finalizeClusters(accums: ClusterAccum[], totalArea: number): Cluster[] {
  const list: Cluster[] = accums.map((c) => {
    const rep = normalize(c.sum);
    const dir = snapToAxis(rep) ?? rep;
    return { normal: cleanZero(dir), area: c.area, share: totalArea > 0 ? c.area / totalArea : 0 };
  });
  list.sort(compareClusters);
  return list;
}

// ---- Main axis (PCA) -------------------------------------------------------

interface Eigen3 {
  values: Vec3; // diagonal entries (input order kept, unsorted)
  vectors: [Vec3, Vec3, Vec3]; // vectors[k] is the eigenvector of values[k]
}

/* Diagonalizes a symmetric 3x3 matrix by cyclic Jacobi rotations (at most 50 sweeps, stopping early when the off-diagonal sum of squares < 1e-12). */
function jacobiEigen3(mat: [Vec3, Vec3, Vec3]): Eigen3 {
  const a: number[][] = [[...mat[0]], [...mat[1]], [...mat[2]]];
  const v: number[][] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

  const rotate = (p: number, q: number): void => {
    const apq = a[p]![q]!;
    if (Math.abs(apq) < 1e-300) return;
    const theta = (a[q]![q]! - a[p]![p]!) / (2 * apq);
    const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
    const c = 1 / Math.sqrt(t * t + 1);
    const s = t * c;
    const tau = s / (1 + c);
    const app = a[p]![p]!, aqq = a[q]![q]!;
    a[p]![p] = app - t * apq;
    a[q]![q] = aqq + t * apq;
    a[p]![q] = 0;
    a[q]![p] = 0;
    for (let i = 0; i < 3; i++) {
      if (i !== p && i !== q) {
        const aip = a[i]![p]!, aiq = a[i]![q]!;
        a[i]![p] = aip - s * (aiq + tau * aip);
        a[p]![i] = a[i]![p]!;
        a[i]![q] = aiq + s * (aip - tau * aiq);
        a[q]![i] = a[i]![q]!;
      }
      const vip = v[i]![p]!, viq = v[i]![q]!;
      v[i]![p] = vip - s * (viq + tau * vip);
      v[i]![q] = viq + s * (vip - tau * viq);
    }
  };

  for (let iter = 0; iter < 50; iter++) {
    const off = a[0]![1]! * a[0]![1]! + a[0]![2]! * a[0]![2]! + a[1]![2]! * a[1]![2]!;
    if (off < 1e-12) break;
    rotate(0, 1);
    rotate(0, 2);
    rotate(1, 2);
  }

  return {
    values: [a[0]![0]!, a[1]![1]!, a[2]![2]!],
    vectors: [
      [v[0]![0]!, v[1]![0]!, v[2]![0]!],
      [v[0]![1]!, v[1]![1]!, v[2]![1]!],
      [v[0]![2]!, v[1]![2]!, v[2]![2]!],
    ],
  };
}

function covarianceOf(points: Vec3[]): [Vec3, Vec3, Vec3] {
  const n = points.length;
  let mx = 0, my = 0, mz = 0;
  for (const p of points) { mx += p[0]; my += p[1]; mz += p[2]; }
  mx /= n; my /= n; mz /= n;

  let cxx = 0, cyy = 0, czz = 0, cxy = 0, cxz = 0, cyz = 0;
  for (const p of points) {
    const dx = p[0] - mx, dy = p[1] - my, dz = p[2] - mz;
    cxx += dx * dx; cyy += dy * dy; czz += dz * dz;
    cxy += dx * dy; cxz += dx * dz; cyz += dy * dz;
  }
  const inv = 1 / n;
  return [
    [cxx * inv, cxy * inv, cxz * inv],
    [cxy * inv, cyy * inv, cyz * inv],
    [cxz * inv, cyz * inv, czz * inv],
  ];
}

/* Sets the sign so the largest component (by magnitude) is positive, and snaps within 5 degrees of a world axis. */
function orientAxis(v: Vec3): Vec3 {
  const n = normalize(v);
  let maxIdx = 0;
  for (let i = 1; i < 3; i++) if (Math.abs(n[i]!) > Math.abs(n[maxIdx]!)) maxIdx = i;
  const signed: Vec3 = n[maxIdx]! < 0 ? [-n[0], -n[1], -n[2]] : n;
  return cleanZero(snapToAxis(signed) ?? signed);
}

function principalAxis(points: Vec3[]): { axis: Vec3; elongation: number } {
  if (points.length < 2) return { axis: [0, 0, 0], elongation: Number.NaN };

  const { values, vectors } = jacobiEigen3(covarianceOf(points));
  const idx = [0, 1, 2].sort((i, j) => values[j]! - values[i]!); // descending eigenvalue
  const l1 = values[idx[0]!]!, l2 = values[idx[1]!]!;
  const axis = orientAxis(vectors[idx[0]!]!);
  const elongation = l2 <= 1e-12 ? Number.POSITIVE_INFINITY : Math.sqrt(l1 / l2);
  return { axis, elongation };
}

// ---- Cylinder test ---------------------------------------------------------

function pointLineDistance(p: Vec3, axisPoint: Vec3, axisDir: Vec3): number {
  const rel = sub(p, axisPoint);
  const perp = sub(rel, scale(axisDir, dot(rel, axisDir)));
  return length(perp);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function faceCenter(f: FaceRecord): Vec3 {
  const [a, b, c] = f.verts;
  return [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
}

/* How evenly the side face centers lie from the axis: the area-weighted coefficient of variation (standard deviation / mean). */
function distanceCv(sideFaces: FaceRecord[], sideArea: number, axisPoint: Vec3, axis: Vec3): number {
  const dists = sideFaces.map((f) => pointLineDistance(faceCenter(f), axisPoint, axis));
  const mean = sideFaces.reduce((s, f, i) => s + f.area * dists[i]!, 0) / sideArea;
  const variance = sideFaces.reduce((s, f, i) => s + f.area * (dists[i]! - mean) ** 2, 0) / sideArea;
  return Math.sqrt(variance) / mean;
}

function cylinderOf(
  faces: FaceRecord[],
  clusters: Cluster[],
  axis: Vec3,
  totalArea: number,
): { radius: number } | null {
  if (totalArea <= 0) return null;

  const sideFaces = faces.filter((f) => Math.abs(dot(f.normal, axis)) < SIDE_DOT);
  const sideArea = sideFaces.reduce((s, f) => s + f.area, 0);
  if (sideArea / totalArea < 0.5) return null;

  const sideClusters = clusters.filter((c) => Math.abs(dot(c.normal, axis)) < SIDE_DOT);
  if (sideClusters.length < 8) return null;
  if (sideClusters.some((c) => c.share > 0.2)) return null;

  // Orthonormal basis (u,v) of the plane perpendicular to the axis, the azimuth reference. The circular variance is rotation-invariant whichever basis is chosen.
  const arbitrary: Vec3 = Math.abs(axis[1]!) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = normalize(cross(axis, arbitrary));
  const v = cross(axis, u);

  let sx = 0, sy = 0, w = 0;
  for (const f of sideFaces) {
    const nPerp = sub(f.normal, scale(axis, dot(f.normal, axis)));
    const len = length(nPerp);
    if (len < 1e-9) continue;
    sx += f.area * (dot(nPerp, u) / len);
    sy += f.area * (dot(nPerp, v) / len);
    w += f.area;
  }
  const circularVariance = w > 0 ? 1 - Math.sqrt(sx * sx + sy * sy) / w : 0;
  if (circularVariance < 0.9) return null;

  // Point on the axis = mean of the side vertices; radius = median distance of those vertices to the axis.
  const sideVerts: Vec3[] = sideFaces.flatMap((f) => f.verts);
  let ax = 0, ay = 0, az = 0;
  for (const p of sideVerts) { ax += p[0]; ay += p[1]; az += p[2]; }
  const axisPoint: Vec3 = [ax / sideVerts.length, ay / sideVerts.length, az / sideVerts.length];

  // A cylinder surrounds the axis at an even distance. Written as a negation (!<=) so a degenerate shape with mean 0 (NaN) is rejected too.
  if (!(distanceCv(sideFaces, sideArea, axisPoint, axis) <= DIST_CV_MAX)) return null;

  return { radius: median(sideVerts.map((p) => pointLineDistance(p, axisPoint, axis))) };
}

// ---- Public API -----------------------------------------------------------

/* Normal clusters, main axis and cylinder test of a mesh list (as a union). */
export function analyze(meshes: ClippedMesh[]): Analysis {
  const faces = collectFaces(meshes);
  const totalArea = faces.reduce((s, f) => s + f.area, 0);

  const clusters = finalizeClusters(mergeCloseClusters(clusterFaces(faces)), totalArea);
  const { axis, elongation } = principalAxis(collectVertices(meshes));
  const cylinder = cylinderOf(faces, clusters, axis, totalArea);

  return { clusters, totalArea, axis, elongation, cylinder };
}

/* Area share of the faces whose normal is at least minDot (default 0.5) toward N. */
export function shareToward(meshes: ClippedMesh[], N: Vec3, minDot = 0.5): number {
  const dir = normalize(N);
  let matched = 0, total = 0;
  for (const m of meshes) {
    const fd = faceData(m);
    for (let i = 0; i < fd.areas.length; i++) {
      const area = fd.areas[i]!;
      total += area;
      const n: Vec3 = [fd.normals[3 * i]!, fd.normals[3 * i + 1]!, fd.normals[3 * i + 2]!];
      if (dot(n, dir) >= minDot) matched += area;
    }
  }
  return total > 0 ? matched / total : 0;
}
