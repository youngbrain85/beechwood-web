// ------------------------------------------------------------------
//  Coverage score: how much of the surface of the selected part a candidate sheet (a set of views)
//  shows readably, as 0-1. It is the first criterion of the candidate order.
//
//  A face is "covered" when in some view it (1) passes that view's face filter and
//  (2) its normal is at least minDot (default 0.5 = 60 degrees) toward the line of sight (N): it is really drawn
//  and not so inclined that a damage position could not be marked on it. This is a union, so a face covered
//  by several views counts once (the multi-view version of faces.shareToward).
// ------------------------------------------------------------------
import { faceData } from './faces';
import { passesFilter } from './project';
import type { ClippedMesh, FaceFilter, Vec3 } from './types';
import { dot, normalize } from './vec';

/* Minimum dot product of the line of sight and a face normal; a face inclined more than 60 degrees is taken as unreadable in that view. */
const COVER_MIN_DOT = 0.5;

export interface ScoredView {
  normal: Vec3;
  faceFilter: FaceFilter | null;
}

/* Share (0-1) of the surface area the views cover. 0 without faces. */
export function coverage(meshes: ClippedMesh[], views: ScoredView[]): number {
  const dirs = views.map((v) => ({ N: normalize(v.normal), faceFilter: v.faceFilter }));
  let covered = 0;
  let total = 0;

  for (const m of meshes) {
    const fd = faceData(m);
    for (let i = 0; i < fd.areas.length; i++) {
      const area = fd.areas[i]!;
      total += area;
      const n: Vec3 = [fd.normals[3 * i]!, fd.normals[3 * i + 1]!, fd.normals[3 * i + 2]!];
      if (dirs.some((v) => (!v.faceFilter || passesFilter(n, v.faceFilter)) && dot(n, v.N) >= COVER_MIN_DOT)) {
        covered += area;
      }
    }
  }

  return total > 0 ? covered / total : 0;
}
