// ------------------------------------------------------------------
//  Closed loop of registering in fixture mode (real fixture): a damage registered with the app's registerDamage shows up in the
//  next query (the same select as useDamages) with its observation and round, and the derived screen values (deriveAashtoData:
//  worst CS of the 3D heatmap, quantity rows) change without a reload (the fake resolves one level of embedded select).
//  The fixture is git-ignored; without it the group is skipped (create it with node scripts/beechwood/sync-fixtures.mjs).
// ------------------------------------------------------------------
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

const BW = '.fixtures/beechwood.json';

// The supabase used by registerDamage becomes a fake over the fixture (the same setup as fakeSupabase.ts of the dev server)
vi.mock('@/lib/supabase', async () => {
  const fs = await import('node:fs');
  const { createFakeClient } = await import('@/dev/fakeClient');
  const { AASHTO_VIEWS } = await import('@/dev/aashtoViews');
  const path = '.fixtures/beechwood.json';
  const db = fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, 'utf8')) : {};
  return { supabase: createFakeClient(db, { views: AASHTO_VIEWS }) };
});

import { deriveAashtoData } from '@/components/aashto/data';
import { registerDamage } from '@/hooks/useSupabase';
import { supabase } from '@/lib/supabase';
import type { AashtoElementRow, DamageWithDetails, ObjectElementRow, ObjectRow } from '@/types/db';
import { createFakeClient } from './fakeClient';

/* The same select as useDamages */
const DAMAGES_SELECT = '*, damage_observations(*), inspections:first_inspection_id(round_label)';
const fake = supabase as unknown as ReturnType<typeof createFakeClient>;

interface BwDb {
  objects: ObjectRow[];
  damages: DamageWithDetails[];
  object_elements: ObjectElementRow[];
  aashto_elements: AashtoElementRow[];
}

describe.runIf(existsSync(BW))('fixture: a registered damage shows up in the next query with its observation and round', () => {
  // A skipped describe still runs its body at collection time, so the absent fixture must not be read.
  const empty: BwDb = { objects: [], damages: [], object_elements: [], aashto_elements: [] };
  const db = (existsSync(BW) ? JSON.parse(readFileSync(BW, 'utf8')) : empty) as BwDb;

  it('registerDamage, then the damages query: the worst CS of the 3D heatmap goes from CS3 to CS4 without a reload', async () => {
    const beam = db.objects.find((o) => o.object_code === 'BW_BEAM_B2')!;
    const before = deriveAashtoData({ objects: db.objects, damages: db.damages, objectElements: db.object_elements, elements: db.aashto_elements });
    expect(before.worstCs.get('BW_BEAM_B2')).toBe(3); // seeded damage 1080 CS3

    const id = await registerDamage({
      bridgeId: beam.bridge_id,
      objectId: beam.id,
      faultType: 'Cracking (PSC)',
      position: { x: -1.9, y: 7.4, z: -6 },
      widthMm: null,
      lengthM: null,
      cnt: 1,
      grade: null,
      note: 'fixture loop',
      defectNo: 1110,
      conditionState: 4,
      csQuantity: 2,
      csUnit: 'ft',
    });

    const rows = (await fake.from('damages').select(DAMAGES_SELECT).order('created_at', { ascending: false }))
      .data as unknown as DamageWithDetails[];
    const mine = rows.find((d) => d.id === id)!;
    expect(mine.damage_observations).toHaveLength(1);
    expect(mine.damage_observations[0]).toMatchObject({ damage_id: id, condition_state: 4, cs_quantity: 2, cs_unit: 'ft', note: 'fixture loop' });
    expect(mine.inspections).toEqual({ round_label: '2026-09' }); // the seeded round is reused (no new round)
    expect(rows.filter((d) => d.id !== id)).toEqual(db.damages); // the 6 seeded damages are unchanged

    const after = deriveAashtoData({ objects: db.objects, damages: rows, objectElements: db.object_elements, elements: db.aashto_elements });
    expect(after.worstCs.get('BW_BEAM_B2')).toBe(4);
    expect(after.rows.filter((r) => r.objectCode === 'BW_BEAM_B2').map((r) => [r.defectNo, r.cs])).toEqual(
      expect.arrayContaining([
        [1080, 3],
        [1110, 4],
      ]),
    );
    // First of the recent damages (dashboard: latest 6 by observation): the new observation time is the database default now(), later than the seeded ones
    const mineRow = after.rows.find((r) => r.defectNo === 1110)!;
    expect(mineRow.observedAt).not.toBeNull();
    for (const r of after.rows) expect(Date.parse(mineRow.observedAt!)).toBeGreaterThanOrEqual(Date.parse(r.observedAt ?? '') || 0);
  });
});
