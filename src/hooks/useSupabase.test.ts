// ------------------------------------------------------------------
//  hooks/useSupabase: checks the AASHTO queries and the stored-value contract of damage registration with a fake client.
//  The React hooks themselves cannot be tested without a renderer; the query functions they call (fetch*) and registerDamage are tested.
//  registerDamage always carries the four fields (defect_no, condition_state, cs_quantity, cs_unit).
// ------------------------------------------------------------------
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { createFakeClient } from '@/dev/fakeClient';

// A vi.mock factory is hoisted; the shared rows are hoisted with it through vi.hoisted.
const fx = vi.hoisted(() => ({
  tables: {
    // Another round (2026-03) and the seeded round (2026-09); registering reuses the round named by roundLabel of the bridge profile
    inspections: [
      { id: 'insp-1', bridge_id: 'b1', round_label: '2026-03', started_at: null },
      { id: 'insp-bw', bridge_id: 'b1', round_label: '2026-09', started_at: null },
    ],
    aashto_elements: [
      { element_no: 12, name: 'Reinforced Concrete Deck', unit: 'sq ft', category: 'deck' },
      { element_no: 109, name: 'Prestressed Concrete Open Girder/Beam', unit: 'ft', category: 'super' },
    ],
    // 1,001 rows: more than the server max-rows (1,000), i.e. two pages
    object_elements: [
      ...Array.from({ length: 1000 }, (_, i) => ({
        id: i + 1,
        object_id: `beam-${i}`,
        element_no: 109,
        quantity: 1,
        unit: 'ft',
        note: null,
      })),
      { id: 1001, object_id: 'deck-1', element_no: 12, quantity: 500, unit: 'sq ft', note: null },
    ],
    damages: [
      {
        id: 'd1',
        object_id: 'beam-0',
        status: 'active',
        defect_no: 1080,
        damage_observations: [
          { id: 'ob1', damage_id: 'd1', condition_state: 3, cs_quantity: 4, cs_unit: 'ft', observed_at: '2026-09-21T13:20:00+00:00' },
        ],
      },
    ],
  },
}));

vi.mock('@/lib/supabase', async () => {
  const { createFakeClient } = await import('@/dev/fakeClient');
  const { AASHTO_VIEWS } = await import('@/dev/aashtoViews');
  return { supabase: createFakeClient(fx.tables, { views: AASHTO_VIEWS }) };
});

import { supabase } from '@/lib/supabase';
import {
  fetchAashtoElements,
  fetchElementCondition,
  fetchNbiComponents,
  fetchObjectElements,
  registerDamage,
  type NewDamageInput,
} from './useSupabase';

// vi.mock swaps supabase for the fake only at run time; the static type is the real SupabaseClient, which has no writes.
const fake = supabase as unknown as ReturnType<typeof createFakeClient>;

describe('AASHTO query functions, called by the hooks (useAashtoElements, useObjectElements, useElementCondition, useNbiComponents)', () => {
  it('fetchAashtoElements: every aashto_elements row', async () => {
    expect(await fetchAashtoElements()).toEqual({ data: fx.tables.aashto_elements, error: null });
  });

  it('fetchObjectElements: every object_elements row (pages are concatenated past the 1,000-row cap)', async () => {
    const res = await fetchObjectElements();
    expect(res.error).toBeNull();
    expect(res.data).toEqual(fx.tables.object_elements);
  });

  it('fetchElementCondition: v_element_condition (total, CS1-CS4 and element rating per element)', async () => {
    expect(await fetchElementCondition()).toEqual({
      data: [
        { element_no: 12, name: 'Reinforced Concrete Deck', unit: 'sq ft', category: 'deck', total_qty: 500, cs1: 500, cs2: 0, cs3: 0, cs4: 0, rating: 9 },
        { element_no: 109, name: 'Prestressed Concrete Open Girder/Beam', unit: 'ft', category: 'super', total_qty: 1000, cs1: 996, cs2: 0, cs3: 4, cs4: 0, rating: 6 },
      ],
      error: null,
    });
  });

  it('fetchNbiComponents: v_nbi_components (deck, super, sub ratings; columns component and rating)', async () => {
    expect(await fetchNbiComponents()).toEqual({
      data: [
        { component: 'deck', rating: 9 },
        { component: 'super', rating: 6 },
        { component: 'sub', rating: 9 },
      ],
      error: null,
    });
  });
});

// ------------------------------------------------------------------
//  registerDamage: the stored-value contract. It registers on an object without an element ('o-reg') so it does not interfere with the view tests above.
// ------------------------------------------------------------------
/* Exactly the position shape the tablet app writes ({x,y,z,client_id,seq,sheet{id,title,view,u,v}}); no new keys are added */
const POSITION = {
  x: -1.9558,
  y: 7.3902,
  z: -6.858,
  client_id: 'af8dc413-38af-5fbb-9240-fcd226b4a831',
  seq: 1,
  sheet: { id: 'BW-BEAM-B-INT', title: 'Beams — Interior Faces, Span B (Lines 2 & 3)', view: 'b2_w', u: 0.25, v: 0.45 },
} as NewDamageInput['position'];

const AASHTO_FIELDS = { defectNo: 1080, conditionState: 3, csQuantity: 4, csUnit: 'ft' } as const;

beforeEach(() => {
  fake.writes.length = 0;
});

describe('registerDamage (AASHTO): carries defect number, state and element quantity', () => {
  it('damages.defect_no and damage_observations.condition_state/cs_quantity/cs_unit; position is passed through as received', async () => {
    const id = await registerDamage({
      bridgeId: 'b1',
      objectId: 'o-reg',
      faultType: 'Delamination/Spall/Patched Area',
      position: POSITION,
      widthMm: null,
      lengthM: null,
      cnt: 1,
      quantity: null,
      grade: null, // there is no letter grade; the state goes in condition_state
      note: '',
      ...AASHTO_FIELDS,
    });
    expect(fake.writes).toStrictEqual([
      {
        table: 'damages',
        row: {
          bridge_id: 'b1',
          object_id: 'o-reg',
          first_inspection_id: 'insp-bw', // no round given, so the round of the profile roundLabel (2026-09)
          fault_type: 'Delamination/Spall/Patched Area',
          fault_detail: null,
          shape_kind: 'point',
          position: POSITION,
          defect_no: 1080,
        },
      },
      {
        table: 'damage_observations',
        row: {
          damage_id: id,
          inspection_id: 'insp-bw',
          width_mm: null,
          length_m: null,
          cnt: 1,
          quantity: null,
          grade: null,
          note: null,
          condition_state: 3,
          cs_quantity: 4,
          cs_unit: 'ft',
        },
      },
    ]);
    expect(Object.keys(fake.writes[0]!.row.position as object)).toEqual(['x', 'y', 'z', 'client_id', 'seq', 'sheet']);
  });

  it('carries null when the four fields are not given (the keys are always present)', async () => {
    await registerDamage({
      bridgeId: 'b1',
      objectId: 'o-reg',
      faultType: 'Cracking (RC and Other)',
      position: POSITION,
      widthMm: null,
      lengthM: null,
      cnt: 1,
      grade: null,
      note: '',
    });
    expect(fake.writes[0]!.row).toMatchObject({ defect_no: null });
    expect(fake.writes[0]!.row).toHaveProperty('defect_no', null);
    for (const k of ['condition_state', 'cs_quantity', 'cs_unit']) {
      expect(fake.writes[1]!.row).toHaveProperty(k, null);
    }
  });
});

// ------------------------------------------------------------------
//  Default round label: when the caller gives no roundLabel, the round of the bridge profile (2026-09).
// ------------------------------------------------------------------
describe('registerDamage: the default round is roundLabel of the bridge profile', () => {
  const base = {
    bridgeId: 'b1',
    objectId: 'o-reg',
    faultType: 'X',
    position: { x: 0, y: 0, z: 0 },
    widthMm: null,
    lengthM: null,
    cnt: 1,
    grade: null,
    note: '',
  };

  it('reuses the profile round row when no round is given (no new round is created)', async () => {
    await registerDamage(base);
    expect(fake.writes.map((w) => w.table)).toEqual(['damages', 'damage_observations']);
    expect(fake.writes[0]!.row.first_inspection_id).toBe('insp-bw');
  });

  it('uses a given round; the default is not used', async () => {
    await registerDamage({ ...base, roundLabel: '2026-03' });
    expect(fake.writes[0]!.row.first_inspection_id).toBe('insp-1');
  });
});
