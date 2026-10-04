import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { box } from './__fixtures__/shapes';
import { viewBasis } from './basis';
import { clipMeshes } from './clip';
import { buildOccluder, passesFilter, projectView } from './project';
import { NO_CLIP, type ClipBox, type FaceFilter, type MeshInput, type Vec3 } from './types';

describe('projectView: synthetic shapes', () => {
  it('unit box from +X: 4 silhouette, 0 feature, 4 hidden (outline of the back face, 0.5 m or longer)', () => {
    const m = clipMeshes([box([0, 0, 0], [1, 1, 1])], NO_CLIP);
    const p = projectView(m, viewBasis([1, 0, 0]), { occluder: buildOccluder(m) })!;
    expect([p.sil.length, p.feat.length, p.hidden.length]).toEqual([4, 0, 4]);
    expect(p.range).toEqual([0, 1, -1, 0, 1]);           // u=z, v=−y, n=x
  });
  it('an occluder in front demotes the solid lines of the box behind to hidden lines', () => {
    const m = clipMeshes([box([0, 0, 0], [1, 1, 1], 'back'), box([2, -1, -1], [2.1, 2, 2], 'plate')], NO_CLIP);
    const p = projectView(m, viewBasis([1, 0, 0]), { occluder: buildOccluder(m) })!;
    const inBack = (s: number[]) => s.every((c, i) => (i % 2 === 0 ? c >= -1e-9 && c <= 1 + 1e-9 : c >= -1 - 1e-9 && c <= 1e-9));
    expect(p.sil.filter(inBack).length).toBe(0);
  });
  it('gives null without any face', () => {
    expect(projectView([], viewBasis([1, 0, 0]))).toBeNull();
  });
});

describe('passesFilter: azimuth face filter', () => {
  const f = (halfDeg: number): FaceFilter => ({ kind: 'azimuth', axis: [0, 1, 0], center: [0, 0, -1], halfDeg });
  const at = (deg: number): Vec3 => [Math.sin((deg * Math.PI) / 180), 0, -Math.cos((deg * Math.PI) / 180)];

  it('passes within halfDeg (+0.5 degree slack) of the center azimuth, fails beyond', () => {
    expect(passesFilter(at(0), f(45))).toBe(true);
    expect(passesFilter(at(45), f(45))).toBe(true);
    expect(passesFilter(at(45.4), f(45))).toBe(true);   // within the 0.5 degree slack
    expect(passesFilter(at(45.6), f(45))).toBe(false);
    expect(passesFilter(at(90), f(45))).toBe(false);
  });
  // A unit normal tilted deg from the axis (+Y) toward -Z; its azimuth always equals the center ([0,0,-1]).
  const tilt = (deg: number): Vec3 => [0, Math.cos((deg * Math.PI) / 180), -Math.sin((deg * Math.PI) / 180)];

  it('fails when parallel to the axis (|n.axis| >= 0.7) even with the center azimuth', () => {
    expect(passesFilter(tilt(0), f(179))).toBe(false);   // exactly axis-parallel: no orthogonal component
    expect(passesFilter(tilt(45), f(10))).toBe(false);   // |n·axis| = 0.707
    expect(passesFilter(tilt(46), f(10))).toBe(true);    // |n·axis| = 0.695
  });
});

describe('projectView: face filter', () => {
  const only = (center: Vec3, halfDeg: number): FaceFilter => ({ kind: 'azimuth', axis: [0, 1, 0], center, halfDeg });

  it('keeping only the -Z face, range and classification reflect that face alone', () => {
    const m = clipMeshes([box([0, 0, 0], [1, 1, 1])], NO_CLIP);
    const p = projectView(m, viewBasis([1, 0, 0]), { faceFilter: only([0, 0, -1], 10), occluder: buildOccluder(m) })!;
    expect(p.range).toEqual([0, 0, -1, 0, 1]);          // only vertices of the z=0 face, so the u width is 0
    expect([p.sil.length, p.feat.length, p.hidden.length]).toEqual([0, 0, 1]); // a back-facing face: 1 hidden line (2 overlapping lines merged)
  });
  it('gives null when no face passes', () => {
    const m = clipMeshes([box([0, 0, 0], [1, 1, 1])], NO_CLIP);
    expect(projectView(m, viewBasis([1, 0, 0]), { faceFilter: only([Math.SQRT1_2, 0, Math.SQRT1_2], 1) })).toBeNull();
  });
});

interface ParityCase { name: string; clip: Record<string, [number, number]>; meshes: Array<{ name: string; positions: number[]; indices: number[] }>;
  views: Array<{ N: number[]; U: number[]; V: number[]; range: number[]; counts: { sil: number; feat: number; seg: number; hidden: number } }> }
const parity = JSON.parse(readFileSync('src/lib/proposal/__fixtures__/parity.json', 'utf8')) as { cases: ParityCase[] };

describe('parity with the pipeline sheet generator (project_view)', () => {
  for (const c of parity.cases) {
    it(`${c.name}: basis 1e-9, range 1e-6, segment counts +-2% (at least +-2)`, () => {
      const inputs: MeshInput[] = c.meshes.map((m) => ({ name: m.name, objectId: m.name, fine: '', positions: new Float64Array(m.positions), indices: new Uint32Array(m.indices) }));
      const clip: ClipBox = { x: c.clip.x ?? null, y: c.clip.y ?? null, z: c.clip.z ?? null };
      const meshes = clipMeshes(inputs, clip);
      const occ = buildOccluder(meshes);
      for (const v of c.views) {
        const b = viewBasis(v.N as [number, number, number]);
        b.U.forEach((x, i) => expect(Math.abs(x - v.U[i]!)).toBeLessThan(1e-9));
        b.V.forEach((x, i) => expect(Math.abs(x - v.V[i]!)).toBeLessThan(1e-9));
        const p = projectView(meshes, b, { occluder: occ })!;
        p.range.forEach((x, i) => expect(Math.abs(x - v.range[i]!)).toBeLessThan(1e-6));
        for (const k of ['sil', 'feat', 'hidden'] as const) {
          const tol = Math.max(2, Math.ceil(v.counts[k] * 0.02));
          expect(Math.abs(p[k].length - v.counts[k]), `${k} ${p[k].length} vs ${v.counts[k]}`).toBeLessThanOrEqual(tol);
        }
      }
    });
  }
});
