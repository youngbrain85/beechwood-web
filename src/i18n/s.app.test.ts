// ------------------------------------------------------------------
//  App shell texts (s.app.ts): the bridge name and subtitle come from the bridge profile.
// ------------------------------------------------------------------
import { describe, expect, it } from 'vitest';
import { bridge } from '@/bridge';
import { BRIDGE_SUB } from '@/bridge/beechwood/texts';
import { SApp, SAuth } from './s.app';

/* String values of a table (functions are called with sample arguments) */
function values(table: Record<string, unknown>): string[] {
  return Object.values(table).map((v) => (typeof v === 'function' ? String((v as (a: string) => unknown)('x')) : String(v)));
}

describe('bridge name and subtitle come from the profile', () => {
  it('app subtitle = Bridge Visual Inspection + the profile bridge name', () => {
    expect(SApp.brandSub).toBe(`Bridge Visual Inspection — ${bridge.texts.bridgeName}`);
    expect(SApp.brandSub).toBe('Bridge Visual Inspection — Beechwood Bridge');
  });

  it('hero bridge name and subtitle are the profile texts', () => {
    expect(bridge.texts.bridgeName).toBe('Beechwood Bridge');
    expect(bridge.texts.bridgeSub).toBe(BRIDGE_SUB);
  });

  it('app shell and login texts contain no Hangul', () => {
    const all = [...values(SApp), ...values(SAuth)];
    expect(all.filter((s) => /[\uAC00-\uD7A3]/.test(s))).toEqual([]);
  });
});
