// ------------------------------------------------------------------
//  Shared derived values of the screens (deriveAashtoData): unpacks the rows of four hooks (objects, damages, object_elements,
//  aashto_elements) into the indexes, rows and observations the screens use. Checked against the real fixture
//  (.fixtures/beechwood.json, the pipeline seed): observations summed per element equal the materialized v_element_condition.
//  The fixture is git-ignored; without it only the fixture cases are skipped (create it with node scripts/beechwood/sync-fixtures.mjs).
// ------------------------------------------------------------------
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { aggregate } from '@/lib/eval/aashto';
import type {
  AashtoElementRow,
  DamageWithDetails,
  ElementConditionRow,
  ObjectElementRow,
  ObjectRow,
} from '@/types/db';
import { deriveAashtoData } from './data';
import { csCounts } from './rows';

const FIXTURE = '.fixtures/beechwood.json';

describe('deriveAashtoData: empty input', () => {
  it('empty indexes and rows', () => {
    const d = deriveAashtoData({ objects: [], damages: [], objectElements: [], elements: [] });
    expect(d.rows).toEqual([]);
    expect(d.observations).toEqual([]);
    expect(d.worstCs.size).toBe(0);
    expect(d.elements.size).toBe(0);
    expect(d.elementQtyByObjectId.size).toBe(0);
  });
});

describe('deriveAashtoData: element total of an object (total warning of the damage form)', () => {
  const oe = (id: number, object_id: string, element_no: number, quantity: number): ObjectElementRow => ({
    id,
    object_id,
    element_no,
    quantity,
    unit: 'ft',
    note: null,
  });

  it('object id to object_elements.quantity of that object\'s element (the one elementByObjectId picks: the lowest number when several)', () => {
    const d = deriveAashtoData({
      objects: [],
      damages: [],
      objectElements: [oe(1, 'o-beam', 109, 89.5), oe(2, 'o-cap', 310, 4), oe(3, 'o-cap', 234, 22)],
      elements: [],
    });
    expect(d.elementByObjectId.get('o-cap')).toBe(234);
    expect([...d.elementQtyByObjectId]).toEqual([
      ['o-beam', 89.5],
      ['o-cap', 22],
    ]);
  });
});

describe.runIf(existsSync(FIXTURE))('deriveAashtoData: fixture (6 seeded damages)', () => {
  // A skipped describe still runs its body at collection time, so the absent fixture must not be read.
  const empty = { objects: [], damages: [], object_elements: [], aashto_elements: [], v_element_condition: [] };
  const db = (existsSync(FIXTURE) ? JSON.parse(readFileSync(FIXTURE, 'utf8')) : empty) as {
    objects: ObjectRow[];
    damages: DamageWithDetails[];
    object_elements: ObjectElementRow[];
    aashto_elements: AashtoElementRow[];
    v_element_condition: ElementConditionRow[];
  };
  const d = deriveAashtoData({
    objects: db.objects,
    damages: db.damages,
    objectElements: db.object_elements,
    elements: db.aashto_elements,
  });

  it('indexes: 80 objects, 59 objects with an element, 12 library elements', () => {
    expect(d.objectById.size).toBe(80);
    expect(d.objectByCode.get('BW_BEAM_B2')?.object_code).toBe('BW_BEAM_B2');
    expect(d.elementByObjectId.size).toBe(59);
    expect(d.elements.get(109)).toEqual({ name: 'Prestressed Concrete Open Girder/Beam', unit: 'ft', category: 'super' });
  });

  it('element totals: 59 objects with an element; beam B2 (109) 89.5 ft', () => {
    expect(d.elementQtyByObjectId.size).toBe(59);
    expect(d.elementQtyByObjectId.get(d.objectByCode.get('BW_BEAM_B2')!.id)).toBe(89.5);
  });

  it('6 active damages give 6 quantity rows and 6 observations (all on objects with an element)', () => {
    expect(d.rows).toHaveLength(6);
    expect(d.observations).toHaveLength(6);
    const beam = d.rows.find((r) => r.objectCode === 'BW_BEAM_B2')!;
    expect(beam).toMatchObject({ elementNo: 109, defectNo: 1080, cs: 3, qty: 4, unit: 'ft' });
  });

  it('observations summed per element equal v_element_condition of the snapshot (screen = database view rule)', () => {
    const quantities = db.object_elements.map((oe) => ({ objectCode: oe.object_id, elementNo: oe.element_no, quantity: Number(oe.quantity) }));
    const got = aggregate(quantities, d.observations)
      .sort((a, b) => a.elementNo - b.elementNo)
      .map((c) => [c.elementNo, c.total, ...c.cs].map((x) => Math.round(x * 1e6) / 1e6));
    const want = db.v_element_condition.map((r) => [r.element_no, r.total_qty, r.cs1, r.cs2, r.cs3, r.cs4]);
    expect(got).toEqual(want);
  });

  it('worst defects: 109 has 1080 CS3 4 ft, 310 has 2230 CS3 1 each, 12 has 1130 CS2 12 sq ft', () => {
    expect(d.worstDefects.get(109)).toEqual([{ defectNo: 1080, cs: 3, quantity: 4 }]);
    expect(d.worstDefects.get(310)).toEqual([{ defectNo: 2230, cs: 3, quantity: 1 }]);
    expect(d.worstDefects.get(12)).toEqual([{ defectNo: 1130, cs: 2, quantity: 12 }]);
  });

  it('3D heatmap: worst CS (null for the 21 objects without an element)', () => {
    expect(d.worstCs.get('BW_BEAM_B2')).toBe(3);
    expect(d.worstCs.get('BW_BRG_B3_3N')).toBe(3);
    expect(d.worstCs.get('BW_DECK_B')).toBe(2);
    expect(d.worstCs.get('BW_DECK_A')).toBe(1);
    expect(d.worstCs.get('BW_XF_A')).toBeNull();
    expect(csCounts(d.worstCs)).toEqual({ 1: 53, 2: 4, 3: 2, 4: 0, none: 21 });
  });
});
