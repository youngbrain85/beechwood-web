// ------------------------------------------------------------------
//  Damage rows, groups and 3D heatmap states of the screens (pure), shared by the quantities screen, the sheet viewer and the 3D view.
//  One damage = an active damage + its latest observation (the same rule as v_element_condition), giving No./Element/Defect/CS/Qty/Unit/Notes.
// ------------------------------------------------------------------
import { describe, expect, it } from 'vitest';
import type { DamageWithDetails, ObjectRow, SheetRow } from '@/types/db';
import { csCounts, damageCs, damageRows, groupRows, worstCsForObjects, type AashtoElementInfo } from './rows';

const obj = (id: string, object_code: string): ObjectRow => ({
  id,
  bridge_id: 'b',
  object_code,
  member_id: null,
  group_code: 'BEECHWOOD',
  name: object_code,
  el_range: null,
  glb_file: null,
});
const OBJECTS = [obj('o-beam', 'BW_BEAM_B2'), obj('o-deck', 'BW_DECK_B'), obj('o-xf', 'BW_XF_B'), obj('o-wing', 'BW_EB1_WING_A')];
const objectById = new Map(OBJECTS.map((o) => [o.id, o]));
const elementByObjectId = new Map([
  ['o-beam', 109],
  ['o-deck', 12],
  ['o-wing', 215],
]);
const ELEMENTS: Map<number, AashtoElementInfo> = new Map([
  [12, { name: 'Reinforced Concrete Deck', unit: 'sq ft', category: 'deck' }],
  [109, { name: 'Prestressed Concrete Open Girder/Beam', unit: 'ft', category: 'super' }],
  [215, { name: 'Reinforced Concrete Abutment', unit: 'ft', category: 'sub' }],
] as const);

function damage(p: Partial<DamageWithDetails> & { id: string }): DamageWithDetails {
  return {
    bridge_id: 'b',
    object_id: null,
    sheet_id: null,
    first_inspection_id: null,
    fault_type: 'X',
    fault_detail: null,
    shape_kind: 'point',
    position: null,
    photo_url: null,
    repair_method: null,
    status: 'active',
    created_at: '2026-09-21T13:00:00+00:00',
    damage_observations: [],
    inspections: { round_label: '2026-09' },
    ...p,
  };
}
const obs = (id: string, observed_at: string, condition_state: 1 | 2 | 3 | 4 | null, cs_quantity: number | null, extra = {}) => ({
  id,
  damage_id: 'd',
  inspection_id: 'i',
  width_mm: null,
  length_m: null,
  cnt: 1,
  quantity: null,
  unit: null,
  grade: null,
  note: null,
  observed_at,
  condition_state,
  cs_quantity,
  cs_unit: null,
  ...extra,
});

const ctx = { objectById, elementByObjectId, elements: ELEMENTS };

describe('damageRows: one active damage = one row (latest observation)', () => {
  it('a seeded damage gives the quantity cells (No., element, defect, CS, quantity, unit, notes)', () => {
    const rows = damageRows(
      [
        damage({
          id: 'd1',
          object_id: 'o-beam',
          sheet_id: 's-beam',
          fault_type: 'Delamination/Spall/Patched Area',
          fault_detail: 'West face, 0.25 L from Bent 2',
          defect_no: 1080,
          position: { x: 0, y: 0, z: 0, seq: 1 },
          damage_observations: [
            obs('a', '2026-09-20T00:00:00Z', 2, 1, { cs_unit: 'ft' }),
            obs('b', '2026-09-21T13:20:00Z', 3, 4, { cs_unit: 'ft', note: 'Demo record' }),
          ],
        }),
      ],
      ctx,
    );
    expect(rows).toEqual([
      {
        id: 'd1',
        no: 1,
        objectId: 'o-beam',
        objectCode: 'BW_BEAM_B2',
        sheetId: 's-beam',
        elementNo: 109,
        elementName: 'Prestressed Concrete Open Girder/Beam',
        category: 'super',
        defectNo: 1080,
        defectName: 'Delamination/Spall/Patched Area',
        cs: 3,
        qty: 4,
        unit: 'ft',
        notes: 'West face, 0.25 L from Bent 2 — Demo record',
        observedAt: '2026-09-21T13:20:00Z',
        round: '2026-09',
      },
    ]);
  });

  it('the defect name comes from the library (else the stored fault_type); the unit is the observation unit, else the element unit', () => {
    const [r] = damageRows(
      [damage({ id: 'd2', object_id: 'o-deck', fault_type: 'free text', defect_no: 1130, damage_observations: [obs('c', '2026-09-21T00:00:00Z', 2, 12)] })],
      ctx,
    );
    expect(r!.defectName).toBe('Cracking (RC and Other)');
    expect(r!.unit).toBe('sq ft');
    const [u] = damageRows([damage({ id: 'd3', object_id: 'o-deck', fault_type: 'Custom', damage_observations: [] })], ctx);
    expect(u).toMatchObject({ defectNo: null, defectName: 'Custom', cs: null, qty: null, unit: 'sq ft' });
  });

  it('an object without an element (cross-frame) still has a row, with an empty element and no category', () => {
    const [r] = damageRows([damage({ id: 'd4', object_id: 'o-xf', defect_no: 1000, damage_observations: [obs('d', '2026-09-21T00:00:00Z', 2, 1)] })], ctx);
    expect(r).toMatchObject({ objectCode: 'BW_XF_B', elementNo: null, elementName: null, category: null, unit: null });
  });

  it('inactive damages are left out', () => {
    expect(damageRows([damage({ id: 'd5', object_id: 'o-deck', status: 'repaired' })], ctx)).toEqual([]);
  });
});

describe('groupRows: groups by object and by sheet', () => {
  const rows = damageRows(
    [
      damage({ id: 'a', object_id: 'o-deck', sheet_id: 's2', position: { x: 0, y: 0, z: 0, seq: 2 }, damage_observations: [obs('1', '2026-09-21T00:00:00Z', 2, 1)] }),
      damage({ id: 'b', object_id: 'o-beam', sheet_id: 's1', position: { x: 0, y: 0, z: 0, seq: 1 }, damage_observations: [obs('2', '2026-09-21T00:00:00Z', 3, 1)] }),
      damage({ id: 'c', object_id: 'o-deck', sheet_id: 's2', position: { x: 0, y: 0, z: 0, seq: 1 }, damage_observations: [obs('3', '2026-09-21T00:00:00Z', 2, 1)] }),
      damage({ id: 'd', object_id: 'o-wing', sheet_id: null, damage_observations: [obs('4', '2026-09-21T00:00:00Z', 2, 1)] }),
    ],
    ctx,
  );
  const sheet = (id: string, title: string, sort_no: number): SheetRow =>
    ({ id, bridge_id: 'b', member_id: null, title, sort_no, zone_type: null, zone_spec: null }) as SheetRow;
  const sheets = new Map([
    ['s1', sheet('s1', 'Beams — Interior Faces, Span B', 11)],
    ['s2', sheet('s2', 'Deck — Top Surface, Span B', 2)],
  ]);

  it('by object: natural order of object codes, No. order inside a group', () => {
    const g = groupRows(rows, 'object', sheets);
    expect(g.map((x) => x.label)).toEqual(['BW_BEAM_B2', 'BW_DECK_B', 'BW_EB1_WING_A']);
    expect(g[1]!.rows.map((r) => r.id)).toEqual(['c', 'a']);
  });

  it('by sheet: sheet number (sort_no) order, damages without a sheet in a last group (label null)', () => {
    const g = groupRows(rows, 'sheet', sheets);
    expect(g.map((x) => x.label)).toEqual(['Deck — Top Surface, Span B', 'Beams — Interior Faces, Span B', null]);
    expect(g[0]!.rows.map((r) => r.no)).toEqual([1, 2]);
    expect(g[2]!.rows.map((r) => r.id)).toEqual(['d']);
  });
});

describe('worstCsForObjects: 3D condition heatmap (worst CS per object)', () => {
  it('CS1 with an element and no damage, null without an element (not rated), the worst CS when observed', () => {
    const m = worstCsForObjects(OBJECTS, elementByObjectId, [
      { objectCode: 'BW_BEAM_B2', elementNo: 109, defectNo: 1080, cs: 3, quantity: 4 },
      { objectCode: 'BW_BEAM_B2', elementNo: 109, defectNo: 1110, cs: 2, quantity: 1 },
    ]);
    expect(Object.fromEntries(m)).toEqual({ BW_BEAM_B2: 3, BW_DECK_B: 1, BW_XF_B: null, BW_EB1_WING_A: 1 });
  });

  it('csCounts: legend counts (CS1-CS4, no element)', () => {
    const m = worstCsForObjects(OBJECTS, elementByObjectId, [
      { objectCode: 'BW_BEAM_B2', elementNo: 109, defectNo: 1080, cs: 3, quantity: 4 },
    ]);
    expect(csCounts(m)).toEqual({ 1: 2, 2: 0, 3: 1, 4: 0, none: 1 });
  });
});

describe('damageCs: condition state of one damage (3D marker color), latest observation, active or not', () => {
  it('the CS of the latest observation; null without an observation or with an empty CS', () => {
    expect(damageCs(damage({ id: 'x', damage_observations: [obs('1', '2026-09-20T00:00:00Z', 4, 1), obs('2', '2026-09-21T00:00:00Z', 2, 1)] }))).toBe(2);
    expect(damageCs(damage({ id: 'y', damage_observations: [] }))).toBeNull();
    expect(damageCs(damage({ id: 'z', damage_observations: [obs('3', '2026-09-21T00:00:00Z', null, 1)] }))).toBeNull();
  });
});
