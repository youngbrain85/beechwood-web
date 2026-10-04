// ------------------------------------------------------------------
//  Compositions: decides "which directions to look from" given the face analysis (Analysis).
//  The direction set is the only thing candidates differ in. Paper, scale and the final
//  layout are settled later by picking one of arrangements
//  (for several views, whichever of row, stack or grid gives the larger scale).
//
//  Front F: the direction of the largest vertical cluster by area (>= 8%), flattened and snapped to an axis.
//  Without a dominant vertical plane (a cylinder and the like) it is the west (-X), fixed so that the
//  direction does not wobble with mesh noise.
//
//  Labels come from the bridge's view label table (basis.ViewLabelSet; bridge profile
//  proposal.viewLabels). Inclined faces are numbered from 1 again in each composition,
//  and a name repeated within one composition gets a number appended.
//
//  Deduplication: compositions with the same set of view directions (+ face filters) keep one,
//  the key that comes later (the more specific one) in COMPOSITION_ORDER.
// ------------------------------------------------------------------
import { labelForNormal, rotateAboutY, type ViewLabelSet } from './basis';
import type { Analysis, Cluster } from './faces';
import { shareToward } from './faces';
import type { ClippedMesh, CompositionKey, FaceFilter, Vec3 } from './types';
import { add, cross, dot, normalize, scale, snapZero, sub } from './vec';

/* View layout kinds: `row` side by side, `stack` vertically, `grid` (four or more),
 *  `three_view` with plan on top, front below and side to the right. */
export type Arrangement = 'single' | 'row' | 'stack' | 'grid' | 'three_view';

export interface PlannedView {
  normal: Vec3;
  label: string;
  faceFilter: FaceFilter | null;
}

export interface CompositionPlan {
  key: CompositionKey;
  views: PlannedView[];
  arrangements: Arrangement[];
}

/* Output order and deduplication priority: the later key wins. */
export const COMPOSITION_ORDER: CompositionKey[] = ['single', 'development', 'three_view', 'four_side', 'cylinder'];

const MAIN_SHARE = 0.08; // minimum area share of a cluster for main face and face-by-face development
const THREE_VIEW_SHARE = 0.03; // minimum area share for each of the three directions of a three-view
const VERTICAL_SHARE = 0.3; // minimum vertical face area for four-side development
const HORIZONTAL_DOT = 0.5; // a face (cluster) is vertical when |n.y| is below this
const COLUMN_AXIS_DOT = 0.7; // column-like when the main axis is this vertical
const COLUMN_ELONGATION = 1.5;
const MAX_DEVELOPMENT = 6; // maximum number of views in a face-by-face development
const CAP_DOT = 0.9; // an end cap when |n.L| is above this; it has no azimuth, so it goes last
const QUARTER_HALF_DEG = 45; // half angle of a cylinder quadrant
// The quadrant development uses direction names only when the axis is this vertical. Tilted further,
// the four directions stop being at right angles (quadrants overlap or leave gaps) and the names lose their meaning: quadrant n.
const CYLINDER_AXIS_DOT = 0.9;
const COS5 = Math.cos((5 * Math.PI) / 180);
const AZIMUTH_STEP = 1e-6; // rad; azimuths are rounded before comparing (avoids floating-point ties)
const TAU = 2 * Math.PI;

const UP: Vec3 = [0, 1, 0];
const DOWN: Vec3 = [0, -1, 0];
const WEST: Vec3 = [-1, 0, 0];
const HORIZONTAL_AXES: Vec3[] = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];

// ---- Directions ---------------------------------------------------

/* Keeps the horizontal component, normalizes it, and snaps to +-X or +-Z when within 5 degrees. */
function horizontalSnap(n: Vec3): Vec3 {
  const flat = normalize([n[0], 0, n[2]]);
  if (flat[0] === 0 && flat[2] === 0) return WEST; // a perfectly horizontal face has no azimuth
  for (const axis of HORIZONTAL_AXES) if (dot(flat, axis) >= COS5) return axis;
  return snapZero(flat);
}

/* Front F: the horizontal direction of the largest vertical cluster (>= 8%), else the west (-X). */
function frontDirection(vertical: Cluster[]): Vec3 {
  const top = vertical[0];
  return top && top.share >= MAIN_SHARE ? horizontalSnap(top.normal) : WEST;
}

/* Reference (e1,e2) for azimuths about the main axis L: +X for L = Z, -X for L = Y (starting from the west), +Z for L = X. e1 is made orthogonal to L. */
function azimuthBasis(L: Vec3): { e1: Vec3; e2: Vec3 } {
  const [ax, ay, az] = [Math.abs(L[0]), Math.abs(L[1]), Math.abs(L[2])];
  const seed: Vec3 = az >= ax && az >= ay ? [1, 0, 0] : ay >= ax ? WEST : [0, 0, 1];
  const e1 = snapZero(normalize(sub(seed, scale(L, dot(seed, L)))));
  return { e1, e2: snapZero(cross(L, e1)) };
}

/* Azimuth measured from e1 toward e2 (0 <= theta < 2 pi). Rounded before comparing so ties are not left to floating point. */
function azimuthOf(n: Vec3, e1: Vec3, e2: Vec3): number {
  const raw = Math.round(Math.atan2(dot(n, e2), dot(n, e1)) / AZIMUTH_STEP) * AZIMUTH_STEP;
  return raw < 0 ? raw + TAU : raw;
}

/* Makes a unit vector orthogonal to L; project.passesFilter does not re-orthogonalize the center of a face filter. */
function perpendicular(v: Vec3, L: Vec3): Vec3 {
  return snapZero(normalize(sub(v, scale(L, dot(v, L)))));
}

// ---- Labels ----------------------------------------------------------

/* Labels the views of one composition: inclined faces from 1, a repeated name gets a number appended. */
function labelViews(normals: Vec3[], labels: ViewLabelSet): string[] {
  let oblique = 0;
  const seen = new Map<string, number>();
  return normals.map((n) => {
    const next = oblique + 1;
    const base = labelForNormal(n, next, labels);
    if (base === labels.oblique(next)) oblique = next;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base} ${count}`;
  });
}

/* A set of views without face filters (main face, face-by-face, three-view, four-side). */
function viewsFromNormals(normals: Vec3[], names: ViewLabelSet): PlannedView[] {
  const clean = normals.map((n) => snapZero(n));
  const labels = labelViews(clean, names);
  return clean.map((normal, i) => ({ normal, label: labels[i]!, faceFilter: null }));
}

// ---- Views per composition ---------------------------------------------------

/* Targets of the face-by-face development: clusters with area >= 8% (at most 6) in azimuth order about L (the unfolding order). End caps go last. */
function developmentClusters(clusters: Cluster[], L: Vec3): Cluster[] {
  const picked = clusters.filter((c) => c.share >= MAIN_SHARE).slice(0, MAX_DEVELOPMENT);
  const { e1, e2 } = azimuthBasis(L);
  return picked
    .map((c, i) => ({ c, i, cap: Math.abs(dot(c.normal, L)) > CAP_DOT, az: azimuthOf(c.normal, e1, e2) }))
    .sort((a, b) => Number(a.cap) - Number(b.cap) || a.az - b.az || a.i - b.i)
    .map((x) => x.c);
}

/* Four-quadrant development of a cylinder: direction names [-Z, +X, +Z, -X] for a vertical axis, otherwise quadrants measured from e1 in 45-degree steps. */
function cylinderPlan(L: Vec3, names: ViewLabelSet): CompositionPlan {
  const upright = Math.abs(dot(L, UP)) >= CYLINDER_AXIS_DOT;
  const axis = snapZero(L); // a copy, so the filter does not hold on to the Analysis.axis array
  const { e1, e2 } = azimuthBasis(L);
  const centers: Vec3[] = upright
    ? ([[0, 0, -1], [1, 0, 0], [0, 0, 1], [-1, 0, 0]] as Vec3[]).map((c) => perpendicular(c, L))
    : [45, 135, 225, 315].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        return snapZero(normalize(add(scale(e1, Math.cos(rad)), scale(e2, Math.sin(rad)))));
      });
  const labels = upright ? names.cylinder : names.quadrants;

  return {
    key: 'cylinder',
    views: centers.map((center, i) => ({
      normal: center,
      label: labels[i]!,
      faceFilter: { kind: 'azimuth', axis, center, halfDeg: QUARTER_HALF_DEG },
    })),
    arrangements: ['row', 'stack', 'grid'],
  };
}

// ---- Deduplication -----------------------------------------------------

/* Rounds to 3 decimals, turning -0 into 0. */
function r3(x: number): number {
  const v = Math.round(x * 1000) / 1000;
  return v === 0 ? 0 : v;
}

function viewSignature(v: PlannedView): string {
  const n = v.normal.map(r3).join(',');
  const f = v.faceFilter;
  return f ? `${n}|${f.axis.map(r3).join(',')}|${f.center.map(r3).join(',')}|${f.halfDeg}` : n;
}

/* The same signature for the same set of views in any order. */
function signatureOf(p: CompositionPlan): string {
  return p.views.map(viewSignature).sort().join(';');
}

function rankOf(key: CompositionKey): number {
  return COMPOSITION_ORDER.indexOf(key);
}

function dedupe(plans: CompositionPlan[]): CompositionPlan[] {
  const best = new Map<string, CompositionPlan>();
  for (const p of plans) {
    const sig = signatureOf(p);
    const prev = best.get(sig);
    if (!prev || rankOf(p.key) > rankOf(prev.key)) best.set(sig, p);
  }
  return [...best.values()].sort((a, b) => rankOf(a.key) - rankOf(b.key));
}

// ---- Public API ------------------------------------------------------

/* Builds the compositions to offer from the face analysis (output order = COMPOSITION_ORDER). View labels come from the labels table. */
export function planCompositions(a: Analysis, meshes: ClippedMesh[], labels: ViewLabelSet): CompositionPlan[] {
  const vertical = a.clusters.filter((c) => Math.abs(c.normal[1]) < HORIZONTAL_DOT);
  const verticalShare = vertical.reduce((s, c) => s + c.share, 0);
  const F = frontDirection(vertical);
  const S = rotateAboutY(F, 90);
  const plans: CompositionPlan[] = [];

  // Single main face: always offered. When the largest cluster is under 8% it is the front if vertical faces dominate, otherwise the soffit.
  const top = a.clusters[0];
  const main = top && top.share >= MAIN_SHARE ? top.normal : verticalShare >= 0.5 ? F : DOWN;
  plans.push({ key: 'single', views: viewsFromNormals([main], labels), arrangements: ['single'] });

  // Face-by-face development: a cylinder is continuous around its circumference and is not unfolded face by face.
  if (!a.cylinder) {
    const picked = developmentClusters(a.clusters, a.axis);
    if (picked.length >= 2) {
      plans.push({
        key: 'development',
        views: viewsFromNormals(picked.map((c) => c.normal), labels),
        arrangements: ['row', 'stack', 'grid'],
      });
    }
  }

  // Three-view: only when plan, front and side each show at least 3%.
  if (
    shareToward(meshes, UP) >= THREE_VIEW_SHARE &&
    shareToward(meshes, F) >= THREE_VIEW_SHARE &&
    shareToward(meshes, S) >= THREE_VIEW_SHARE
  ) {
    plans.push({ key: 'three_view', views: viewsFromNormals([UP, F, S], labels), arrangements: ['three_view'] });
  }

  // Four-side development: enough vertical faces, and column-like or at least 3 vertical clusters (thin slabs drop out).
  // Cylinders are excluded: without a face filter it would draw the same silhouette four times; the quadrant development takes that place.
  const columnLike = Math.abs(dot(a.axis, UP)) >= COLUMN_AXIS_DOT && a.elongation >= COLUMN_ELONGATION;
  if (!a.cylinder && verticalShare >= VERTICAL_SHARE && (columnLike || vertical.length >= 3)) {
    plans.push({
      key: 'four_side',
      views: viewsFromNormals([0, 90, 180, 270].map((deg) => rotateAboutY(F, deg)), labels),
      arrangements: ['row', 'stack', 'grid'],
    });
  }

  if (a.cylinder) plans.push(cylinderPlan(a.axis, labels));

  return dedupe(plans);
}
