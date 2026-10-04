// ------------------------------------------------------------------
//  Computed views of fixture mode: v_element_condition and v_nbi_components are computed from rows.
//  The reference for the rules is the pipeline's db/schema.sql (the view definitions). These tests pin the rules
//  one by one (inline rows), and the last group checks equality with the fixture rows materialized by the seed script.
// ------------------------------------------------------------------
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { aggregate, COMPONENT_OF, type ConditionState, type Observation } from '@/lib/eval/aashto';
import { createFakeClient } from './fakeClient';
import { AASHTO_VIEWS, elementConditionRows, nbiComponentRows } from './aashtoViews';

type Row = Record<string, unknown>;
const reader = (tables: Record<string, Row[]>) => async (t: string) => tables[t] ?? [];

const EL = (element_no: number, category: string, unit = 'ft', name = `E${element_no}`): Row => ({
  element_no,
  name,
  unit,
  category,
});
const OE = (id: number, object_id: string, element_no: number, quantity: number, unit = 'ft'): Row => ({
  id,
  object_id,
  element_no,
  quantity,
  unit,
  note: null,
});
const OBS = (
  id: string,
  damage_id: string,
  condition_state: number | null,
  cs_quantity: number | null,
  observed_at: string | null = '2026-09-21T13:00:00+00:00',
): Row => ({ id, damage_id, condition_state, cs_quantity, cs_unit: 'ft', observed_at });
const DMG = (id: string, object_id: string | null, obs: Row[], extra: Row = {}): Row => ({
  id,
  object_id,
  status: 'active',
  damage_observations: obs,
  ...extra,
});

/* A bridge with one element (109, total 100); only the damage rows vary to check the CS sums */
const oneElement = (damages: Row[], extra: Record<string, Row[]> = {}) =>
  reader({
    aashto_elements: [EL(109, 'super')],
    object_elements: [OE(1, 'o1', 109, 100)],
    damages,
    ...extra,
  });
const csOf = async (read: ReturnType<typeof reader>) => {
  const [r] = await elementConditionRows(read);
  return [r?.cs1, r?.cs2, r?.cs3, r?.cs4];
};

describe('elementConditionRows: the v_element_condition rule of schema.sql', () => {
  it('total = sum of object_elements, CS1 = total - sum(CS2..CS4), ascending element_no, name/unit/category from the library', async () => {
    const read = reader({
      aashto_elements: [EL(109, 'super', 'ft', 'Beam'), EL(12, 'deck', 'sq ft', 'Deck')],
      object_elements: [OE(1, 'o1', 109, 60), OE(2, 'o2', 109, 40), OE(3, 'o3', 12, 500, 'sq ft')],
      damages: [DMG('d1', 'o1', [OBS('a', 'd1', 3, 4)]), DMG('d2', 'o3', [OBS('b', 'd2', 2, 12)])],
    });
    // rating = the element's own ladder rating (12: s2 = 12/500 = 0.024 gives 8; 109: s3 = 4/100 = 0.04 gives 6)
    expect(await elementConditionRows(read)).toEqual([
      { element_no: 12, name: 'Deck', unit: 'sq ft', category: 'deck', total_qty: 500, cs1: 488, cs2: 12, cs3: 0, cs4: 0, rating: 8 },
      { element_no: 109, name: 'Beam', unit: 'ft', category: 'super', total_qty: 100, cs1: 96, cs2: 0, cs3: 4, cs4: 0, rating: 6 },
    ]);
  });

  it('rating is the last column, rated by shares of the element\'s own total (not a component sum)', async () => {
    const read = reader({
      aashto_elements: [EL(205, 'sub', 'each'), EL(234, 'sub')],
      object_elements: [OE(1, 'col', 205, 4, 'each'), OE(2, 'cap', 234, 66)],
      damages: [DMG('d1', 'col', [OBS('a', 'd1', 4, 1)])],
    });
    const rows = await elementConditionRows(read);
    expect(rows.map((r) => Object.keys(r).at(-1))).toEqual(['rating', 'rating']);
    // 205: s4 = 1/4 = 0.25 gives 3; 234: undamaged gives 9
    expect(rows.map((r) => [r.element_no, r.rating])).toEqual([
      [205, 3],
      [234, 9],
    ]);
  });

  it('counts only the latest observation per damage: the later observed_at, else the smaller id', async () => {
    const read = oneElement([
      DMG('d1', 'o1', [
        OBS('o-old', 'd1', 2, 10, '2026-01-01T00:00:00+00:00'),
        OBS('o-new', 'd1', 3, 4, '2026-06-01T00:00:00+00:00'),
      ]),
      DMG('d2', 'o1', [OBS('z', 'd2', 4, 1), OBS('m', 'd2', 2, 5)]),
    ]);
    expect(await csOf(read)).toEqual([91, 5, 4, 0]);
  });

  it('compares times as instants, not as strings (even with different offsets)', async () => {
    const read = oneElement([
      DMG('d1', 'o1', [
        // As strings '2026-06-01T09:00+09:00' > '2026-06-01T01:00Z', but as instants 00:00Z < 01:00Z
        OBS('a', 'd1', 4, 9, '2026-06-01T09:00:00+09:00'),
        OBS('b', 'd1', 2, 3, '2026-06-01T01:00:00+00:00'),
      ]),
    ]);
    expect(await csOf(read)).toEqual([97, 3, 0, 0]);
  });

  it('an observation without a time (null) sorts after those with one (nulls last); by id when none has a time', async () => {
    const read = oneElement([
      DMG('d1', 'o1', [OBS('a', 'd1', 4, 9, null), OBS('b', 'd1', 2, 3, '2026-01-01T00:00:00+00:00')]),
      DMG('d2', 'o1', [OBS('y', 'd2', 3, 2, null), OBS('x', 'd2', 4, 1, null)]),
    ]);
    expect(await csOf(read)).toEqual([96, 3, 0, 1]);
  });

  it("active damages only: status 'deleted' is left out, and a row without status (session insert; database default active) counts", async () => {
    const noStatus = DMG('d2', 'o1', [OBS('b', 'd2', 3, 2)]);
    delete noStatus.status;
    const read = oneElement([DMG('d1', 'o1', [OBS('a', 'd1', 2, 7)], { status: 'deleted' }), noStatus]);
    expect(await csOf(read)).toEqual([98, 0, 2, 0]);
  });

  it('with several elements on the damaged object the lowest element number is used; damages on objects without an element or without object_id are left out', async () => {
    const read = reader({
      aashto_elements: [EL(205, 'sub', 'each'), EL(234, 'sub')],
      object_elements: [OE(1, 'o1', 234, 30), OE(2, 'o1', 205, 2, 'each')],
      damages: [
        DMG('d1', 'o1', [OBS('a', 'd1', 3, 1)]),
        DMG('d2', 'o-none', [OBS('b', 'd2', 4, 50)]),
        DMG('d3', null, [OBS('c', 'd3', 4, 50)]),
      ],
    });
    // 205: s3 = 1/2 = 0.5 (>= 0.10 so 6 is out, s4 = 0 < 0.05) gives 5; 234: undamaged gives 9
    expect(await elementConditionRows(read)).toEqual([
      { element_no: 205, name: 'E205', unit: 'each', category: 'sub', total_qty: 2, cs1: 1, cs2: 0, cs3: 1, cs4: 0, rating: 5 },
      { element_no: 234, name: 'E234', unit: 'ft', category: 'sub', total_qty: 30, cs1: 30, cs2: 0, cs3: 0, cs4: 0, rating: 9 },
    ]);
  });

  it('a latest observation with condition_state 1/null or cs_quantity null makes the damage 0; it never falls back to an older observation', async () => {
    const read = oneElement([
      DMG('d1', 'o1', [OBS('a1', 'd1', 4, 50, '2026-01-01T00:00:00+00:00'), OBS('a2', 'd1', null, 5, '2026-02-01T00:00:00+00:00')]),
      DMG('d2', 'o1', [OBS('b', 'd2', 1, 5)]),
      DMG('d3', 'o1', [OBS('c', 'd3', 3, null)]),
    ]);
    expect(await csOf(read)).toEqual([100, 0, 0, 0]);
  });

  it('top-level damage_observations inserted during the session count too; the same observation id in both places counts once', async () => {
    const embedded = OBS('e1', 'd2', 3, 1);
    const read = oneElement([DMG('d1', 'o1', []), DMG('d2', 'o1', [embedded])], {
      damage_observations: [OBS('n1', 'd1', 2, 6, null), { ...embedded }],
    });
    expect(await csOf(read)).toEqual([93, 6, 1, 0]);
  });

  it('CS1 is 0 when the CS sum exceeds the total; it never goes negative', async () => {
    const read = reader({
      aashto_elements: [EL(109, 'super')],
      object_elements: [OE(1, 'o1', 109, 10)],
      damages: [DMG('d1', 'o1', [OBS('a', 'd1', 3, 8)]), DMG('d2', 'o1', [OBS('b', 'd2', 4, 5)])],
    });
    expect(await csOf(read)).toEqual([0, 0, 8, 5]);
  });

  it('an element missing from the element library (aashto_elements) does not appear (inner join)', async () => {
    const read = reader({
      aashto_elements: [EL(109, 'super')],
      object_elements: [OE(1, 'o1', 109, 10), OE(2, 'o2', 999, 10)],
      damages: [],
    });
    expect((await elementConditionRows(read)).map((r) => r.element_no)).toEqual([109]);
  });

  it('fractional quantities round to 6 decimals (mimics numeric; removes float residue like 0.30000000000000004)', async () => {
    const read = reader({
      aashto_elements: [EL(109, 'super')],
      object_elements: [OE(1, 'o1', 109, 0.1), OE(2, 'o2', 109, 0.2)],
      damages: [DMG('d1', 'o1', [OBS('a', 'd1', 2, 0.1)])],
    });
    const [r] = await elementConditionRows(read);
    expect([r?.total_qty, r?.cs1, r?.cs2]).toEqual([0.3, 0.2, 0.1]);
  });
});

describe('nbiComponentRows: the v_nbi_components rule of schema.sql (only the columns component and rating)', () => {
  it('three rows in the order deck, super, sub: rating = minimum of the element ratings of that component; other belongs nowhere', async () => {
    const read = reader({
      aashto_elements: [EL(12, 'deck', 'sq ft'), EL(109, 'super'), EL(205, 'sub', 'each'), EL(234, 'sub'), EL(331, 'other')],
      object_elements: [
        OE(1, 'od', 12, 100, 'sq ft'),
        OE(2, 'ob', 109, 1000),
        OE(3, 'oc', 205, 4, 'each'),
        OE(4, 'ocap', 234, 66),
        OE(5, 'or', 331, 504),
      ],
      damages: [
        DMG('d1', 'od', [OBS('a', 'd1', 2, 12)]),
        DMG('d2', 'ob', [OBS('b', 'd2', 3, 4)]),
        DMG('d3', 'oc', [OBS('c', 'd3', 4, 1)]),
        DMG('d4', 'or', [OBS('d', 'd4', 4, 500)]),
      ],
    });
    // deck 12: s2 0.12 gives 7; super 109: s3 0.004 gives 6; sub: min(205 column 1/4 CS4 gives 3, 234 cap undamaged gives 9) = 3
    //   (a sum across mixed units would give sub s4 = 1/70 = 0.014, i.e. 5: the case that separates the two rules)
    expect(await nbiComponentRows(read)).toEqual([
      { component: 'deck', rating: 7 },
      { component: 'super', rating: 6 },
      { component: 'sub', rating: 3 },
    ]);
  });

  it('with no elements all three rows have rating 9 (like the SQL: 3 values rows left join, coalesce(min, 9))', async () => {
    expect(await nbiComponentRows(reader({}))).toEqual([
      { component: 'deck', rating: 9 },
      { component: 'super', rating: 9 },
      { component: 'sub', rating: 9 },
    ]);
  });
});

describe('AASHTO_VIEWS', () => {
  it('exposes the two view names in the shape of the fake client views option', () => {
    expect(Object.keys(AASHTO_VIEWS).sort()).toEqual(['v_element_condition', 'v_nbi_components']);
  });
});

// ------------------------------------------------------------------
//  NOTE: the real fixture is made with node scripts/beechwood/sync-fixtures.mjs (git-ignored; skipped when absent).
//  The fake computation must equal the view rows the seed script (seed_beechwood.py) materialized with the same rules.
// ------------------------------------------------------------------
const FIXTURE = '.fixtures/beechwood.json';

describe.runIf(existsSync(FIXTURE))('fixture (.fixtures/beechwood.json): fake computation = materialized views', () => {
  const db = (existsSync(FIXTURE) ? JSON.parse(readFileSync(FIXTURE, 'utf8')) : {}) as Record<string, Row[]>;
  // The view keys are removed first, which guarantees the fake computes from rows instead of returning the snapshot's materialized rows
  const rowsOnly = { ...db, v_element_condition: [], v_nbi_components: [] };
  const client = () => createFakeClient(rowsOnly, { views: AASHTO_VIEWS });

  it('v_element_condition: the fake client response equals the materialized rows', async () => {
    const res = await client().from('v_element_condition').select('*').order('element_no');
    expect(res).toEqual({ data: db.v_element_condition, error: null });
  });

  it('v_nbi_components: equals the materialized rows, and the seeded demo damages rate deck 8, super 6, sub 8', async () => {
    const res = await client().from('v_nbi_components').select('*');
    expect(res).toEqual({ data: db.v_nbi_components, error: null });
    expect(res.data.map((r) => [r.component, r.rating])).toEqual([
      ['deck', 8],
      ['super', 6],
      ['sub', 8],
    ]);
  });

  it('element totals and CS equal a direct aggregate() (fixture: one element per object, one observation per damage)', async () => {
    const elementOf = new Map(db.object_elements!.map((oe) => [String(oe.object_id), Number(oe.element_no)]));
    const quantities = db.object_elements!.map((oe) => ({
      objectCode: String(oe.object_id),
      elementNo: Number(oe.element_no),
      quantity: Number(oe.quantity),
    }));
    const observations: Observation[] = db.damages!.flatMap((d) =>
      (d.damage_observations as Row[]).map((ob) => ({
        objectCode: String(d.object_id),
        elementNo: elementOf.get(String(d.object_id))!,
        defectNo: Number(d.defect_no),
        cs: ob.condition_state as ConditionState,
        quantity: Number(ob.cs_quantity),
      })),
    );
    const expected = aggregate(quantities, observations).sort((a, b) => a.elementNo - b.elementNo);

    const { data } = await client().from('v_element_condition').select('*');
    expect(data.map((r) => r.element_no)).toEqual(expected.map((c) => c.elementNo));
    data.forEach((r, i) => {
      const c = expected[i]!;
      [r.total_qty, r.cs1, r.cs2, r.cs3, r.cs4].forEach((v, k) =>
        expect(v as number).toBeCloseTo(k === 0 ? c.total : c.cs[k - 1]!, 6),
      );
    });
  });

  it('element library categories = COMPONENT_OF: the fake groups components (categories) the way componentRating does', () => {
    for (const e of db.aashto_elements!) {
      expect([e.element_no, COMPONENT_OF[Number(e.element_no)] ?? 'other']).toEqual([e.element_no, e.category]);
    }
  });
});
