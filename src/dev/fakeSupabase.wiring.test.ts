// ------------------------------------------------------------------
//  Fixture mode wiring (src/dev/fakeSupabase.ts): the module that fetches the snapshot the dev server serves (/__fx/db.json).
//  The two AASHTO views are computed from the session rows. fetch is replaced by a fake (no network).
// ------------------------------------------------------------------
import { afterEach, describe, expect, it, vi } from 'vitest';

// The materialized view rows of the snapshot are stale on purpose: they must be ignored and computed instead.
const SNAPSHOT = {
  aashto_elements: [{ element_no: 12, name: 'Deck', unit: 'sq ft', category: 'deck' }],
  object_elements: [{ id: 1, object_id: 'o1', element_no: 12, quantity: 100, unit: 'sq ft', note: null }],
  damages: [
    {
      id: 'd1',
      object_id: 'o1',
      status: 'active',
      damage_observations: [
        { id: 'a', damage_id: 'd1', condition_state: 2, cs_quantity: 12, cs_unit: 'sq ft', observed_at: '2026-09-21T13:00:00+00:00' },
      ],
    },
  ],
  v_element_condition: [{ element_no: 12, stale: true }],
  v_nbi_components: [{ component: 'deck', stale: true }],
};

/* Re-imports the module: fakeSupabase holds the snapshot from its first query for the module's lifetime */
async function freshModule(res: { ok: boolean; body?: unknown }) {
  vi.resetModules();
  const fetchMock = vi.fn(async () => ({ ok: res.ok, json: async () => res.body }));
  vi.stubGlobal('fetch', fetchMock);
  const mod = await import('./fakeSupabase');
  return { supabase: mod.supabase, fetchMock };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AASHTO views are computed from session rows, not taken from the snapshot', () => {
  it('v_element_condition · v_nbi_components', async () => {
    const { supabase, fetchMock } = await freshModule({ ok: true, body: SNAPSHOT });
    expect((await supabase.from('v_element_condition').select('*').order('element_no')).data).toEqual([
      { element_no: 12, name: 'Deck', unit: 'sq ft', category: 'deck', total_qty: 100, cs1: 88, cs2: 12, cs3: 0, cs4: 0, rating: 7 },
    ]);
    expect((await supabase.from('v_nbi_components').select('*')).data).toEqual([
      { component: 'deck', rating: 7 },
      { component: 'super', rating: 9 },
      { component: 'sub', rating: 9 },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/__fx/db.json');
  });

  it('names the fixture import command when the snapshot is missing', async () => {
    const { supabase } = await freshModule({ ok: false });
    await expect(supabase.from('objects').select('*')).rejects.toThrow('node scripts/beechwood/sync-fixtures.mjs');
  });
});
