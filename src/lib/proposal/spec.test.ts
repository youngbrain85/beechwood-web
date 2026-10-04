import { describe, expect, it } from 'vitest';
import { viewBasis } from './basis';
import { makeViewSpec, uvToWorld, worldToUv } from './spec';

describe('view spec contract: identical to make_view_spec of the generator', () => {
  const b = viewBasis([-1, 0, 0]);                       // U=+Z, V=−Y
  const s = makeViewSpec('v1', 'West face', b, [242, 263.5, -31.35, -29.16, 9.13], [0.1, 0.2, 0.5, 0.3]);
  it('origin = U x umin + V x vmin + N x nmax, extent = range widths', () => {
    expect(s.origin).toEqual([-9.13, 31.35, 242]);
    expect(s.extent_m).toEqual([21.5, 2.19]);
  });
  it('(u,v) to world to (u,v) round trip within 1e-6, and d is 0 on the inspected face', () => {
    const p = uvToWorld(s, 0.25, 0.75);
    const back = worldToUv(s, p);
    expect(Math.abs(back.u - 0.25)).toBeLessThan(1e-6);
    expect(Math.abs(back.v - 0.75)).toBeLessThan(1e-6);
    expect(Math.abs(back.d)).toBeLessThan(1e-9);
  });
});
