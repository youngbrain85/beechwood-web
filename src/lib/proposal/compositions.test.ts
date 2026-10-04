import { describe, expect, it } from 'vitest';
import { box, cylinderY, transformed } from './__fixtures__/shapes';
import { clipMeshes } from './clip';
import { VIEW_LABELS } from '@/bridge/beechwood/proposal';
import { planCompositions } from './compositions';
import { analyze } from './faces';
import { NO_CLIP } from './types';

// View labels are the stored values of the bridge profile.
const plan = (m: Parameters<typeof clipMeshes>[0]) => {
  const c = clipMeshes(m, NO_CLIP);
  return planCompositions(analyze(c), c, VIEW_LABELS);
};
const keys = (p: ReturnType<typeof plan>) => p.map((x) => x.key);

// Rotation matrices (16 values, column-major) for the transformed fixture.
const ROT_Y45 = [Math.SQRT1_2, 0, -Math.SQRT1_2, 0, 0, 1, 0, 0, Math.SQRT1_2, 0, Math.SQRT1_2, 0, 0, 0, 0, 1];
const ROT_X90 = [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1]; // y to z (lays the cylinder axis along Z)
const rotZ = (deg: number): number[] => {
  const c = Math.cos((deg * Math.PI) / 180), s = Math.sin((deg * Math.PI) / 180);
  return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
};

describe('planCompositions', () => {
  it('slab: one main face (soffit) + face-by-face development (top, soffit); three-view and four-side do not qualify', () => {
    const p = plan([box([-10, 0, 0], [10, 1, 40])]);
    expect(keys(p)).toEqual(['single', 'development']);
    expect(p[0]!.views[0]!.label).toBe('Soffit');
    expect(p[1]!.views.map((v) => v.label)).toEqual(['Top', 'Soffit']);      // by azimuth about the main axis Z (+X 0, +Y 90, -X, -Y)
  });
  it('column box: main face, three-view and four-side development; face-by-face has the same direction set as four-side and is dropped', () => {
    const p = plan([box([-1, 0, -1], [1, 10, 1])]);
    expect(keys(p)).toEqual(['single', 'three_view', 'four_side']);
    expect(p[2]!.views.map((v) => v.label)).toEqual(['West face', 'North face', 'East face', 'South face']);   // from the west, +90 degrees about the y axis each
    expect(p[1]!.views.map((v) => v.label)).toEqual(['Top', 'West face', 'North face']);
    expect(p[1]!.arrangements).toEqual(['three_view']);
  });
  it('cylinder: four-quadrant development appears, face-by-face and four-side do not', () => {
    const p = plan([cylinderY(0, 0, 1.25, 0, 30)]);
    expect(keys(p)).toContain('cylinder');
    expect(keys(p)).not.toContain('development');
    expect(keys(p)).not.toContain('four_side');   // without a filter it would be the same silhouette four times; the quadrant development replaces it
    const cyl = p.find((x) => x.key === 'cylinder')!;
    expect(cyl.views.map((v) => v.label)).toEqual(['Front face', 'East face', 'Back face', 'West face']);
    expect(cyl.views.every((v) => v.faceFilter?.halfDeg === 45)).toBe(true);
  });

  it('two separate cylinders (twin columns): not mistaken for a cylinder; they get face-by-face and four-side development', () => {
    const p = plan([
      cylinderY(-7, 0, 1.25, 0, 30, 32, 'L'),
      cylinderY(7, 0, 1.25, 0, 30, 32, 'R'),
    ]);
    expect(keys(p)).not.toContain('cylinder');
  });

  it('a column turned 45 degrees: faces without a direction name are numbered from inclined face 1 again in each composition', () => {
    const p = plan([transformed(box([-1, 0, -1], [1, 10, 1]), ROT_Y45)]);
    expect(keys(p)).toEqual(['single', 'three_view', 'four_side']);
    expect(p[0]!.views[0]!.label).toBe('Inclined face 1');
    expect(p[1]!.views.map((v) => v.label)).toEqual(['Top', 'Inclined face 1', 'Inclined face 2']);
    expect(p[2]!.views.map((v) => v.label)).toEqual(['Inclined face 1', 'Inclined face 2', 'Inclined face 3', 'Inclined face 4']);
  });
  it('two slabs tilted +-12 degrees: a direction name repeated within a composition gets a number appended', () => {
    const p = plan([
      transformed(box([-10, 0, 0], [10, 1, 40]), rotZ(12)),
      transformed(box([-5, 0, 0], [5, 1, 20], 'b'), rotZ(-12)),
    ]);
    const dev = p.find((x) => x.key === 'development')!;
    expect(dev.views.map((v) => v.label)).toEqual(['Top', 'Top 2', 'Soffit', 'Soffit 2']);
  });
  it('a cylinder lying down: with a non-vertical axis the views are quadrants 1-4 and the filter centers are unit vectors orthogonal to the axis', () => {
    const p = plan([transformed(cylinderY(0, 0, 1.25, 0, 30), ROT_X90)]);
    const cyl = p.find((x) => x.key === 'cylinder')!;
    expect(cyl.views.map((v) => v.label)).toEqual(['Quadrant 1', 'Quadrant 2', 'Quadrant 3', 'Quadrant 4']);
    for (const v of cyl.views) {
      const f = v.faceFilter!;
      expect(f.axis[0] * f.center[0] + f.axis[1] * f.center[1] + f.axis[2] * f.center[2]).toBeCloseTo(0, 12);
      expect(Math.hypot(...f.center)).toBeCloseTo(1, 12);
    }
  });
  it('layout candidates: single for one view, three_view for a three-view, and one of row, stack or grid for several', () => {
    const p = plan([box([-1, 0, -1], [1, 10, 1])]);
    expect(p.map((x) => x.arrangements)).toEqual([['single'], ['three_view'], ['row', 'stack', 'grid']]);
  });
});
