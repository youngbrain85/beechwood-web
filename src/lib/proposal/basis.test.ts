import { describe, expect, it } from 'vitest';
import { VIEW_LABELS } from '@/bridge/beechwood/proposal';
import { labelForNormal, rotateAboutY, viewBasis } from './basis';

const r = (v: number[]) => v.map((x) => Math.round(x * 1e9) / 1e9 + 0);
describe('viewBasis: the reading direction of the existing sheets', () => {
  it('soffit (-Y): U=+Z, V=+X, not mirrored, like the deck soffit sheets', () => {
    const b = viewBasis([0, -1, 0]);
    expect([r(b.U), r(b.V), b.mirrored]).toEqual([[0, 0, 1], [1, 0, 0], false]);
  });
  it('top (+Y): the same U and V, mirrored=true, like the deck top sheets', () => {
    const b = viewBasis([0, 1, 0]);
    expect([r(b.U), r(b.V), b.mirrored]).toEqual([[0, 0, 1], [1, 0, 0], true]);
  });
  it('west face (-X): U=+Z, V=-Y / east face (+X): the same U and V, mirrored', () => {
    expect(r(viewBasis([-1, 0, 0]).U)).toEqual([0, 0, 1]);
    expect(r(viewBasis([-1, 0, 0]).V)).toEqual([0, -1, 0]);
    expect(viewBasis([-1, 0, 0]).mirrored).toBe(false);
    expect(viewBasis([1, 0, 0]).mirrored).toBe(true);
  });
  it('faces looking along the bridge (+-Z): U points to +X', () => {
    expect(r(viewBasis([0, 0, -1]).U)).toEqual([1, 0, 0]);
    expect(r(viewBasis([0, 0, 1]).U)).toEqual([1, 0, 0]);
  });
  it('inclined face: V runs down along the face, and U, V, N are orthonormal', () => {
    const n: [number, number, number] = [-0.9866, 0.1628, 0];
    const b = viewBasis(n);
    expect(b.V[1]).toBeLessThan(0);
    for (const [p, q] of [[b.U, b.V], [b.U, b.N], [b.V, b.N]] as const) expect(Math.abs(p[0] * q[0] + p[1] * q[1] + p[2] * q[2])).toBeLessThan(1e-9);
    expect(b.U[2]).toBeGreaterThan(0);
  });
});
describe('labelForNormal / rotateAboutY', () => {
  it('a direction name within 20 degrees of an axis, otherwise inclined face n', () => {
    expect(['Top', 'Soffit', 'West face', 'East face', 'South face', 'North face']).toEqual(
      ([[0, 1, 0], [0, -1, 0], [-1, 0, 0], [1, 0, 0], [0, 0, -1], [0, 0, 1]] as const).map((n) => labelForNormal([...n], 1, VIEW_LABELS)));
    expect(labelForNormal([-0.9866, 0.1628, 0], 1, VIEW_LABELS)).toBe('West face');
    expect(labelForNormal([0.7071, 0.7071, 0], 2, VIEW_LABELS)).toBe('Inclined face 2');
  });
  it('+90 degrees about the y axis: +X goes to -Z', () => {
    expect(r(rotateAboutY([1, 0, 0], 90))).toEqual([0, 0, -1]);
  });
});
