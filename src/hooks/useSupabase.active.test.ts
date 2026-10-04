// Damage query: leaves out damages marked deleted (status = 'deleted'), the same rule as the tablet app
// and the database views (v_element_condition counts active damages only).
import { describe, expect, it, vi } from 'vitest';
import { createFakeClient } from '@/dev/fakeClient';

vi.mock('@/lib/supabase', () => ({
  supabase: createFakeClient({
    damages: [
      { id: 'a', status: 'active', created_at: '2026-10-02' },
      { id: 'x', status: 'deleted', created_at: '2026-10-03' },
      { id: 'b', status: 'active', created_at: '2026-10-01' },
    ],
  }),
}));

import { supabase } from '@/lib/supabase';
import { fetchActiveDamages } from './useSupabase';

describe('fetchActiveDamages', () => {
  it('reads the current damages only, without those marked deleted', async () => {
    const { data, error } = await fetchActiveDamages();
    expect(error).toBeNull();
    expect((data as Array<{ id: string }>).map((d) => d.id)).toEqual(['a', 'b']);
  });

  it('reads back a damage registered in the session (it gets the database default status)', async () => {
    await supabase.from('damages').insert({ fault_type: 'Cracking (PSC)' });
    const { data } = await fetchActiveDamages();
    expect((data as Array<{ id: string }>).map((d) => d.id)).toEqual(['a', 'b', 'fx-1']);
  });
});
