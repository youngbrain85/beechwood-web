// ------------------------------------------------------------------
//  Proposal engine: turns the selected part (meshes + range) into several candidate sheets.
//  (1) cut, (2) face analysis, (3) compositions, (4) projection (+ hidden lines), (5) layout and scale,
//  (6) view specs, (7) drawing fragment, (8) covered area, (9) sort.
//
//  A pure function (no DOM, no network), so it runs unchanged in a worker. Projection is the heavy
//  part, so a projection with the same direction + filter is reused across compositions.
//
//  Candidate order: covered area descending, drawing-area fill descending, view count ascending, COMPOSITION_ORDER.
//  (A good proposal shows a lot, draws it large and uses few views.)
//
//  Stored values (bridge name of the spec, title format, composition names, default fine member) follow the
//  proposal rules of the active bridge (src/bridge/proposal.ts).
// ------------------------------------------------------------------
import { proposalProfile } from '@/bridge/proposal';
import type { Basis } from './basis';
import { viewBasis } from './basis';
import { boundsOf, clipMeshes, triangleCount } from './clip';
import type { Arrangement, CompositionPlan, PlannedView } from './compositions';
import { COMPOSITION_ORDER, planCompositions } from './compositions';
import { drawingFragment } from './drawing';
import { analyze } from './faces';
import type { LayoutResult } from './layout';
import { FRAME, layoutViews } from './layout';
import type { Projection } from './project';
import { buildOccluder, projectView } from './project';
import type { ViewSpec } from './spec';
import { makeViewSpec } from './spec';
import { coverage } from './score';
import { suggestTitle } from './title';
import type { ClipBox, CompositionKey, MeshInput, Vec3 } from './types';
import { ENGINE_VERSION, MAX_TRIANGLES } from './types';

/* Composition names; defined in types.ts and re-exported here so existing import paths keep working. */

/**
 * Thrown when the selection is empty (`empty`), too large to process at once (`too_large`),
 * or does not fit one sheet in any layout (`no_fit`).
 *
 * message is an **ASCII English diagnostic**: it crosses the worker boundary for developers and is not
 * shown on screen as is (the screen picks a text from s.proposal.ts by `code`).
 */
export class EngineError extends Error {
  constructor(public code: 'empty' | 'too_large' | 'no_fit', message: string) {
    super(message);
    this.name = 'EngineError';
  }
}

export interface EngineInput {
  meshes: MeshInput[];
  clip: ClipBox;
  objectCodes: string[];
}

/* One stored proposal; the same shape as zone_spec of the pipeline's sheet generator. */
export interface ProposalSpec {
  title: string;
  /* Stored bridge name (storedName of the bridge profile) */
  bridge: string;
  composition: CompositionKey;
  engine: string;
  /* Coordinate frame of placement: normalized 0-1 from the top left of the canvas (the same key and value as the generator's zone_spec). */
  placement_frame: 'topleft_normalized';
  canvas_mm: [number, number];
  layout: LayoutResult['info'];
  zone: { objects: string[]; clip: ClipBox; bounds: { min: Vec3; max: Vec3 } };
  views: ViewSpec[];
}

export interface Candidate {
  key: CompositionKey;
  spec: ProposalSpec;
  drawing: string;
  metrics: { views: number; coverage: number; fill: number; paper: 'A3' | 'A1'; denom: number; triangles: number };
  warnings: string[];
}

// ---- Small helpers -----------------------------------------------------

/* Rounds to 4 decimals, turning -0 into 0 (the same rule as spec.ts). */
function round4(x: number): number {
  const r = Math.round(x * 1e4) / 1e4;
  return r === 0 ? 0 : r;
}

function roundRange(r: [number, number] | null): [number, number] | null {
  return r ? [round4(r[0]), round4(r[1])] : null;
}

function roundVec(v: Vec3): Vec3 {
  return [round4(v[0]), round4(v[1]), round4(v[2])];
}

/* The cut recorded on a view: **only the narrowed axes**, in z, y, x order. undefined when nothing was narrowed (to leave the key out). */
function viewClip(clip: ClipBox): Record<string, [number, number]> | undefined {
  const out: Record<string, [number, number]> = {};
  for (const axis of ['z', 'y', 'x'] as const) {
    const r = clip[axis];
    if (r) out[axis] = [round4(r[0]), round4(r[1])];
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/* Rounding for sort comparisons, so two candidates covering the same faces do not differ by 1e-17. */
function r9(x: number): number {
  return Math.round(x * 1e9) / 1e9;
}

/* Total surface area of one mesh (sq m): the sum of half the cross product magnitudes of its triangles (the same formula as faces.faceData).
 *  Only the area is needed here, so no normals or centers are built (a selection can have hundreds of thousands of faces). */
function surfaceArea(m: MeshInput): number {
  const p = m.positions;
  const f = m.indices;
  let sum = 0;
  for (let i = 0; i + 2 < f.length; i += 3) {
    const a = 3 * f[i]!;
    const b = 3 * f[i + 1]!;
    const c = 3 * f[i + 2]!;
    const ux = p[b]! - p[a]!, uy = p[b + 1]! - p[a + 1]!, uz = p[b + 2]! - p[a + 2]!;
    const vx = p[c]! - p[a]!, vy = p[c + 1]! - p[a + 1]!, vz = p[c + 2]! - p[a + 2]!;
    const cx = uy * vz - uz * vy;
    const cy = uz * vx - ux * vz;
    const cz = ux * vy - uy * vx;
    sum += Math.sqrt(cx * cx + cy * cy + cz * cz) / 2;
  }
  return sum;
}

/**
 * Fine member for the title: the fine with the **largest total surface area** (the first one on a tie). fallback when none can be used
 * (from the bridge's proposal rules).
 *
 * Not the most frequent by mesh **count**: a deck panel carries dozens of small cross members, so counting
 * would name it after them, while the large beams are what dominate the drawing.
 */
function dominantFine(meshes: MeshInput[], fallback: string): string {
  const areas = new Map<string, number>();
  for (const m of meshes) {
    if (!m.fine) continue;
    areas.set(m.fine, (areas.get(m.fine) ?? 0) + surfaceArea(m));
  }
  let best = fallback;
  let bestArea = -1;
  for (const [fine, a] of areas) {
    if (a > bestArea) {
      best = fine;
      bestArea = a;
    }
  }
  return best;
}

/* Direction (3 decimals) + face filter: the same signature means the same projection result. */
function projectionSignature(v: PlannedView): string {
  const r3 = (x: number): number => (Math.round(x * 1000) === 0 ? 0 : Math.round(x * 1000) / 1000);
  const n = v.normal.map(r3).join(',');
  const f = v.faceFilter;
  return f ? `${n}|${f.axis.map(r3).join(',')}|${f.center.map(r3).join(',')}|${f.halfDeg}` : n;
}

/* When dropped views break the premise of a dedicated layout (three_view with 3, single with 1), falls back to a general layout. */
function arrangementsFor(plan: CompositionPlan, views: number): Arrangement[] {
  const broken = plan.arrangements.some(
    (a) => (a === 'three_view' && views !== 3) || (a === 'single' && views !== 1),
  );
  return broken ? ['row', 'stack'] : plan.arrangements;
}

interface KeptView {
  view: PlannedView;
  basis: Basis;
  projection: Projection;
}

// ---- Public API ------------------------------------------------------

/* Selected part to the list of candidate sheets (best first). EngineError when there are no faces or the selection is too large. */
export function runEngine(input: EngineInput, onProgress?: (done: number, total: number) => void): Candidate[] {
  // (1) Cut: the input guard judges by the real amount left after cutting.
  const meshes = clipMeshes(input.meshes, input.clip);
  const triangles = triangleCount(meshes);
  if (triangles === 0) throw new EngineError('empty', 'no faces left in the selected range');
  if (triangles > MAX_TRIANGLES) {
    throw new EngineError('too_large', `too many triangles: ${triangles} > ${MAX_TRIANGLES}`);
  }

  // (2) Face analysis, (3) compositions
  const analysis = analyze(meshes);
  const plans = planCompositions(analysis, meshes, proposalProfile.viewLabels);
  const bounds = boundsOf(meshes)!; // faces remain, so vertices remain
  const fine = dominantFine(input.meshes, proposalProfile.fallbackFine);
  // Built anew per candidate: an object shared by several specs would leak an edit of one into another.
  const makeZone = (): ProposalSpec['zone'] => ({
    objects: [...input.objectCodes],
    clip: { x: roundRange(input.clip.x), y: roundRange(input.clip.y), z: roundRange(input.clip.z) },
    bounds: { min: roundVec(bounds.min), max: roundVec(bounds.max) },
  });

  // (4) Projection: the occlusion BVH is built once, and the same direction + filter is reused across compositions.
  const occluder = buildOccluder(meshes);
  const cache = new Map<string, Projection | null>();
  const total = plans.reduce((s, p) => s + p.views.length, 0);
  let done = 0;
  const project = (v: PlannedView, basis: Basis): Projection | null => {
    const sig = projectionSignature(v);
    let hit = cache.get(sig);
    if (hit === undefined) {
      hit = projectView(meshes, basis, { faceFilter: v.faceFilter, occluder });
      cache.set(sig, hit);
    }
    done += 1;
    onProgress?.(done, total);
    return hit;
  };

  const candidates: Candidate[] = [];
  let noFit = 0; // number of compositions skipped because they do not fit one sheet
  for (const plan of plans) {
    const kept: KeptView[] = [];
    for (const view of plan.views) {
      const basis = viewBasis(view.normal);
      const projection = project(view, basis);
      // A view without any line only takes up an empty slot, so it is dropped.
      if (projection && projection.sil.length + projection.feat.length + projection.hidden.length > 0) {
        kept.push({ view, basis, projection });
      }
    }
    if (kept.length === 0) continue; // a composition with nothing to draw is not a candidate

    // (5) Layout, scale, paper
    const extents = kept.map(({ projection: p }): [number, number] => [p.range[1] - p.range[0], p.range[3] - p.range[2]]);
    const layout = layoutViews(extents, arrangementsFor(plan, kept.length));
    // A composition with no layout that fits the drawing area is not a candidate: better dropped than drawn overflowing.
    if (!layout) {
      noFit += 1;
      continue;
    }

    // (6) View specs: the sheet-level zone.clip is the reference for the cut, but each view also records **only the narrowed axes**
    //    (a later sheet builder reads zone_spec.views[].clip of existing sheets per view).
    const views = kept.map(({ view, basis, projection }, i) => {
      // Built anew per view: an object shared by several views would leak an edit of one into another (the same practice as makeZone).
      const clip = viewClip(input.clip);
      return makeViewSpec(`v${i + 1}`, view.label, basis, projection.range, layout.placements[i]!, {
        face_filter: view.faceFilter,
        ...(clip ? { clip } : {}), // nothing narrowed: the key is left out
      });
    });

    // (7) Drawing fragment, (8) covered area
    const drawing = drawingFragment(
      kept.map(({ projection }, i) => ({ id: views[i]!.id, rect: layout.rects[i]!, projection })),
      layout.mmPerM,
    );
    const covered = coverage(meshes, kept.map(({ view }) => ({ normal: view.normal, faceFilter: view.faceFilter })));
    const canvas = layout.paper === 'A3' ? FRAME.canvasA3 : FRAME.canvasA1;

    candidates.push({
      key: plan.key,
      spec: {
        title: suggestTitle(
          {
            fine,
            codes: input.objectCodes,
            compositionName: proposalProfile.compositionNames[plan.key],
            clip: input.clip,
            bounds,
          },
          proposalProfile.title,
        ),
        bridge: proposalProfile.storedName,
        composition: plan.key,
        engine: ENGINE_VERSION,
        placement_frame: 'topleft_normalized',
        canvas_mm: [canvas[0], canvas[1]],
        layout: layout.info,
        zone: makeZone(),
        views,
      },
      drawing,
      metrics: {
        views: views.length,
        coverage: covered,
        fill: layout.info.fill_bbox,
        paper: layout.paper,
        denom: layout.denomPaper,
        triangles,
      },
      warnings: [...layout.warnings],
    });
  }

  // When there were compositions but all dropped out as "does not fit one sheet", zero candidates does not mean nothing to draw.
  if (candidates.length === 0 && noFit > 0) {
    throw new EngineError('no_fit', 'no arrangement fits on one sheet');
  }

  // (9) Sort
  return candidates.sort(
    (a, b) =>
      r9(b.metrics.coverage) - r9(a.metrics.coverage)
      || b.metrics.fill - a.metrics.fill
      || a.metrics.views - b.metrics.views
      || COMPOSITION_ORDER.indexOf(a.key) - COMPOSITION_ORDER.indexOf(b.key),
  );
}
