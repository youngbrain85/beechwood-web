// ------------------------------------------------------------------
//  Existing sheets hint: approximates which of the existing sheets already show the
//  selected part. Three things are checked together (geometry alone does not separate them):
//
//   (1) Member family: fine of the selected meshes to the sheet families that draw that part (zone_type).
//      Sheets of different families can cover the same place (an outside and an inside
//      view, say); position and normal alone cannot tell which sheet draws the member.
//   (2) Area: faces are weighted by area, not counted as points. If a small stiffener face weighed as much
//      as a large web, the ratio would follow the mesh subdivision instead of the shape.
//   (3) The view's clip box **and** the depth window: both must hold for a face to count as covered.
//      A view plane is anchored at the outermost extent of the whole sheet, so inclined or stepped members
//      fall far outside a narrow depth window; the window is generous ([-7,+0.5]) and the clip narrows it.
//      The clip alone is not enough: a clip usually **leaves the depth axis of its view open**,
//      so a twin member offset only along the depth axis would fall into the same rectangle
//      and the same clip and come out as a runner-up.
//
//  The source is zone_type, title and zone_spec of the database `sheets` rows (the screen uses useSheets()).
//  This is a geometric approximation, so the UI labels the result "approximate"; it is not
//  a verdict.
// ------------------------------------------------------------------
import { faceData } from './faces';
import { worldToUv } from './spec';
import type { ClippedMesh, Vec3 } from './types';
import { cross, dot } from './vec';

/* The range a view cuts to; only the given axes are checked (a missing axis is unbounded). */
export type ClipRanges = Partial<Record<'x' | 'y' | 'z', [number, number]>>;

export interface ExistingView {
  origin: Vec3;
  u: Vec3;
  v: Vec3;
  normal: Vec3 | null;
  extent: [number, number];
  clip: ClipRanges | null;
}

export interface ExistingSheet {
  sheetId: string;
  title: string;
  /* Sheet family = database sheets.zone_type, the same naming as the output of familiesFor. */
  family: string;
  views: ExistingView[];
}

export interface Covering {
  sheetId: string;
  title: string;
  ratio: number;
}

// ---- Faces ---------------------------------------------------------------

/* One face: center, unit normal, area. */
interface Face {
  c: Vec3;
  n: Vec3;
  a: number;
}

/* Sample cap: with more faces than this, only this many of the largest are used. */
const MAX_FACES = 20_000;

/**
 * Collects the faces of the mesh list. With more than max faces only the max largest **by area** are kept
 * (ties in original order; Array#sort is stable, so this is deterministic). The total area is then that partial sum.
 */
function collectFaces(meshes: ClippedMesh[], max: number): Face[] {
  const out: Face[] = [];
  for (const mesh of meshes) {
    const fd = faceData(mesh);
    for (let i = 0; i < fd.areas.length; i++) {
      out.push({
        c: [fd.centroids[3 * i]!, fd.centroids[3 * i + 1]!, fd.centroids[3 * i + 2]!],
        n: [fd.normals[3 * i]!, fd.normals[3 * i + 1]!, fd.normals[3 * i + 2]!],
        a: fd.areas[i]!,
      });
    }
  }
  if (out.length <= max) return out;
  return out.sort((p, q) => q.a - p.a).slice(0, max);
}

// ---- Finding existing sheets ----------------------------------------------------

/* Depth window, generous because view planes are anchored at the outermost extent of a sheet. Used for views with a clip too. */
const DEFAULT_DEPTH: [number, number] = [-7, 0.5];
/* Minimum n.N for a view to see a face "nearly head-on" (within 60 degrees). */
const FACING_DOT = 0.5;
/* Floating-point slack on clip bounds, so a face right on the boundary is not thrown out. */
const CLIP_EPS = 1e-6;

function insideClip(c: Vec3, clip: ClipRanges): boolean {
  if (clip.x && (c[0] < clip.x[0] - CLIP_EPS || c[0] > clip.x[1] + CLIP_EPS)) return false;
  if (clip.y && (c[1] < clip.y[0] - CLIP_EPS || c[1] > clip.y[1] + CLIP_EPS)) return false;
  if (clip.z && (c[2] < clip.z[0] - CLIP_EPS || c[2] > clip.z[1] + CLIP_EPS)) return false;
  return true;
}

/**
 * Does one view cover face f; **all** four must hold:
 *  (1) both extents are positive (2) (u,v) is inside the rectangle (3) the view sees the face nearly head-on
 *  (4) with a clip, the face center is inside it, **and** inside the depth window (always checked, clip or not).
 * A view with normal null uses cross(u,v) as its normal, but which side is the front is unknown, so
 * (3) is skipped and the depth is judged by |d| regardless of sign.
 */
function viewContains(view: ExistingView, f: Face, depth: [number, number], maxAbsDepth: number): boolean {
  if (!(view.extent[0] > 0) || !(view.extent[1] > 0)) return false; // prevents division by zero (a NaN would slip past the range checks)

  const normal = view.normal ?? cross(view.u, view.v);
  const { u, v, d } = worldToUv(
    { origin: view.origin, u: view.u, v: view.v, normal, extent_m: view.extent },
    f.c,
  );
  if (u < 0 || u > 1 || v < 0 || v > 1) return false;
  if (view.normal && dot(f.n, view.normal) < FACING_DOT) return false;
  if (view.clip && !insideClip(f.c, view.clip)) return false;

  return view.normal === null ? Math.abs(d) <= maxAbsDepth : d >= depth[0] && d <= depth[1];
}

/**
 * Projects the selected meshes back onto the view planes of existing sheets to find sheets that already show the part (approximate).
 * Only sheets of a matching family are examined; per sheet, a face covered by any view adds its area once,
 * and ratio = covered area / total area of the faces used. Sheets with ratio >= minRatio are returned in
 * descending order (ascending sheetId on ties), at most limit of them.
 */
export function findCoveringSheets(
  meshes: ClippedMesh[],
  families: readonly string[],
  sheets: readonly ExistingSheet[],
  opts?: { minRatio?: number; limit?: number; depth?: [number, number]; maxFaces?: number },
): Covering[] {
  const wanted = new Set(families);
  const targets = sheets.filter((s) => wanted.has(s.family));
  if (targets.length === 0) return [];

  const faces = collectFaces(meshes, opts?.maxFaces ?? MAX_FACES);
  const totalArea = faces.reduce((s, f) => s + f.a, 0);
  if (totalArea <= 0) return []; // prevents 0/0

  const minRatio = opts?.minRatio ?? 0.1;
  const limit = opts?.limit ?? 5;
  const depth = opts?.depth ?? DEFAULT_DEPTH;
  const maxAbsDepth = Math.max(Math.abs(depth[0]), Math.abs(depth[1]));

  const results: Covering[] = [];
  for (const s of targets) {
    let covered = 0;
    for (const f of faces) {
      if (s.views.some((view) => viewContains(view, f, depth, maxAbsDepth))) covered += f.a;
    }
    const ratio = covered / totalArea;
    if (ratio >= minRatio) results.push({ sheetId: s.sheetId, title: s.title, ratio });
  }

  results.sort((a, b) => b.ratio - a.ratio || (a.sheetId < b.sheetId ? -1 : a.sheetId > b.sheetId ? 1 : 0));
  return results.slice(0, limit);
}

// ---- Reading database rows --------------------------------------------------------

function vec3(v: unknown): Vec3 | null {
  return Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number')
    ? [v[0] as number, v[1] as number, v[2] as number]
    : null;
}

function pair(v: unknown): [number, number] | null {
  return Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === 'number')
    ? [v[0] as number, v[1] as number]
    : null;
}

/* Keeps only the axes among x, y, z that have the [lo,hi] shape. null when no axis is usable (= judged by the depth window). */
function clipOf(v: unknown): ClipRanges | null {
  if (v === null || typeof v !== 'object') return null;
  const src = v as Record<string, unknown>;
  const out: ClipRanges = {};
  let any = false;
  for (const k of ['x', 'y', 'z'] as const) {
    const r = pair(src[k]);
    if (r) {
      out[k] = r;
      any = true;
    }
  }
  return any ? out : null;
}

/**
 * Database sheets rows (zone_type, title, zone_spec) to ExistingSheet[].
 * A view missing a required field is skipped on its own; a row with no usable view or without its head fields is
 * skipped entirely. The hint is supplementary, so one broken row must not stop everything.
 */
export function existingSheetsFromRows(
  rows: ReadonlyArray<{ title: string; zone_type: string | null; zone_spec: unknown }>,
): ExistingSheet[] {
  const out: ExistingSheet[] = [];
  for (const row of rows) {
    const spec = (row.zone_spec ?? null) as { sheet_id?: unknown; views?: unknown } | null;
    const sheetId = spec && typeof spec.sheet_id === 'string' ? spec.sheet_id : null;
    if (!sheetId || !row.zone_type || !row.title || !Array.isArray(spec?.views)) continue;

    const views: ExistingView[] = [];
    for (const raw of spec.views as unknown[]) {
      if (raw === null || typeof raw !== 'object') continue;
      const v = raw as Record<string, unknown>;
      const origin = vec3(v.origin);
      const uAxis = vec3(v.u);
      const vAxis = vec3(v.v);
      const extent = pair(v.extent_m);
      if (!origin || !uAxis || !vAxis || !extent) continue;
      views.push({ origin, u: uAxis, v: vAxis, normal: vec3(v.normal), extent, clip: clipOf(v.clip) });
    }
    if (views.length > 0) out.push({ sheetId, title: row.title, family: row.zone_type, views });
  }
  return out;
}
