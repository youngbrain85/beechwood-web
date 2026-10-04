// Damage rows to AASHTO observations (Observation): the conversion used by the screens (3D condition heatmap, worst defects of the element table, quantity table).
// The rules match v_element_condition (schema.sql): one latest observation per active damage (later observed_at first, null last,
// smaller id on a tie), the object's element (the lowest number when several), no damages on objects without an element, CS 2-4 only.
import { describe, expect, it } from 'vitest';
import {
  elementByObject,
  isActiveDamage,
  latestObservation,
  observationsOf,
  worstDefectsByElement,
} from './observations';
import { aggregate, worstCsByObject } from './condition';

const ob = (id: string, observed_at: string | null, condition_state: number | null, cs_quantity: number | null = 1) => ({
  id,
  observed_at,
  condition_state,
  cs_quantity,
});

describe('latestObservation: the single latest observation (distinct on ... order by observed_at desc nulls last, id)', () => {
  it('the later observation wins', () => {
    const a = ob('a', '2026-09-21T13:00:00+00:00', 2);
    const b = ob('b', '2026-09-22T13:00:00+00:00', 3);
    expect(latestObservation([a, b])).toBe(b);
    expect(latestObservation([b, a])).toBe(b);
  });

  it('an observation without observed_at goes last', () => {
    const a = ob('a', null, 4);
    const b = ob('b', '2026-09-01T00:00:00+00:00', 2);
    expect(latestObservation([a, b])).toBe(b);
  });

  it('the smaller id wins on equal times', () => {
    const t = '2026-09-21T13:00:00+00:00';
    expect(latestObservation([ob('z', t, 2), ob('m', t, 3)])!.id).toBe('m');
  });

  it('compares times as instants, not strings (even with different offsets)', () => {
    const early = ob('a', '2026-09-21T14:00:00+02:00', 2); // = 12:00Z
    const late = ob('b', '2026-09-21T13:00:00+00:00', 3); // = 13:00Z
    expect(latestObservation([early, late])).toBe(late);
  });

  it('gives null for no observations', () => {
    expect(latestObservation([])).toBeNull();
    expect(latestObservation(null)).toBeNull();
    expect(latestObservation(undefined)).toBeNull();
  });
});

describe('isActiveDamage', () => {
  it("a missing status counts as the database default 'active'; any other status is inactive", () => {
    expect(isActiveDamage({})).toBe(true);
    expect(isActiveDamage({ status: null })).toBe(true);
    expect(isActiveDamage({ status: 'active' })).toBe(true);
    expect(isActiveDamage({ status: 'repaired' })).toBe(false);
    expect(isActiveDamage({ status: 'deleted' })).toBe(false);
  });
});

describe('elementByObject: the element of an object (the lowest number when several)', () => {
  it('the lowest element number', () => {
    const m = elementByObject([
      { object_id: 'deck', element_no: 510 },
      { object_id: 'deck', element_no: 12 },
      { object_id: 'beam', element_no: 109 },
    ]);
    expect(m.get('deck')).toBe(12);
    expect(m.get('beam')).toBe(109);
    expect(m.has('xf')).toBe(false);
  });
});

describe('observationsOf: damage rows to Observation[]', () => {
  const codes = new Map([
    ['o-beam', 'BW_BEAM_B2'],
    ['o-deck', 'BW_DECK_B'],
    ['o-xf', 'BW_XF_B'],
  ]);
  const elements = new Map([
    ['o-beam', 109],
    ['o-deck', 12],
  ]);

  it('one entry when the latest observation of an active damage is CS2-4: object code, element, defect, CS, quantity', () => {
    const got = observationsOf(
      [
        {
          id: 'd1',
          object_id: 'o-beam',
          defect_no: 1080,
          status: 'active',
          damage_observations: [ob('x1', '2026-09-20T00:00:00Z', 2, 1), ob('x2', '2026-09-21T00:00:00Z', 3, 4)],
        },
      ],
      codes,
      elements,
    );
    expect(got).toEqual([{ objectCode: 'BW_BEAM_B2', elementNo: 109, defectNo: 1080, cs: 3, quantity: 4 }]);
  });

  it('left out: inactive, no observation, latest observation CS1 or empty, object without an element, damage without an object', () => {
    const got = observationsOf(
      [
        { id: 'a', object_id: 'o-beam', defect_no: 1110, status: 'repaired', damage_observations: [ob('1', '2026-09-21T00:00:00Z', 4)] },
        { id: 'b', object_id: 'o-beam', defect_no: 1110, damage_observations: [] },
        { id: 'c', object_id: 'o-deck', defect_no: 1130, damage_observations: [ob('2', '2026-09-22T00:00:00Z', 1), ob('3', '2026-09-20T00:00:00Z', 3)] },
        { id: 'd', object_id: 'o-deck', defect_no: 1130, damage_observations: [ob('4', '2026-09-22T00:00:00Z', null)] },
        { id: 'e', object_id: 'o-xf', defect_no: 1000, damage_observations: [ob('5', '2026-09-22T00:00:00Z', 3)] },
        { id: 'f', object_id: null, defect_no: 1000, damage_observations: [ob('6', '2026-09-22T00:00:00Z', 3)] },
      ],
      codes,
      elements,
    );
    expect(got).toEqual([]);
  });

  it('an empty quantity counts 0: the total equals an SQL sum (null skipped) and the damage still counts for the worst CS', () => {
    const got = observationsOf(
      [{ id: 'g', object_id: 'o-deck', defect_no: 1080, damage_observations: [ob('7', '2026-09-22T00:00:00Z', 3, null)] }],
      codes,
      elements,
    );
    expect(got).toEqual([{ objectCode: 'BW_DECK_B', elementNo: 12, defectNo: 1080, cs: 3, quantity: 0 }]);
  });

  it('a missing defect number becomes 0', () => {
    const got = observationsOf(
      [{ id: 'h', object_id: 'o-deck', damage_observations: [ob('8', '2026-09-22T00:00:00Z', 2, 5)] }],
      codes,
      elements,
    );
    expect(got[0]!.defectNo).toBe(0);
  });

  it('the shape of the 6 seeded damages: aggregate gives the CS quantities of v_element_condition (109: CS3 4 ft)', () => {
    const obs = observationsOf(
      [{ id: 'd1', object_id: 'o-beam', defect_no: 1080, damage_observations: [ob('x', '2026-09-21T13:20:00+00:00', 3, 4)] }],
      codes,
      elements,
    );
    const [c] = aggregate([{ objectCode: 'BW_BEAM_B2', elementNo: 109, quantity: 1000 }], obs);
    expect(c).toEqual({ elementNo: 109, total: 1000, cs: [996, 0, 4, 0] });
    expect(worstCsByObject(obs).get('BW_BEAM_B2')).toBe(3);
  });
});

describe('worstDefectsByElement: the "worst defects" cell of the element table', () => {
  it('per element, the worst CS of each defect and its quantity: higher CS first, then larger quantity, then number', () => {
    const m = worstDefectsByElement([
      { objectCode: 'D1', elementNo: 12, defectNo: 1130, cs: 2, quantity: 12 },
      { objectCode: 'D2', elementNo: 12, defectNo: 1080, cs: 3, quantity: 2 },
      { objectCode: 'D2', elementNo: 12, defectNo: 1130, cs: 2, quantity: 5 },
      { objectCode: 'D3', elementNo: 12, defectNo: 1120, cs: 2, quantity: 30 },
      { objectCode: 'B1', elementNo: 109, defectNo: 1080, cs: 3, quantity: 4 },
    ]);
    expect(m.get(12)).toEqual([
      { defectNo: 1080, cs: 3, quantity: 2 },
      { defectNo: 1120, cs: 2, quantity: 30 },
      { defectNo: 1130, cs: 2, quantity: 17 },
    ]);
    expect(m.get(109)).toEqual([{ defectNo: 1080, cs: 3, quantity: 4 }]);
    expect(m.has(215)).toBe(false);
  });

  it('a defect observed in several CS counts only the quantity of its worst CS', () => {
    const m = worstDefectsByElement([
      { objectCode: 'B1', elementNo: 109, defectNo: 1110, cs: 2, quantity: 10 },
      { objectCode: 'B2', elementNo: 109, defectNo: 1110, cs: 4, quantity: 1 },
    ]);
    expect(m.get(109)).toEqual([{ defectNo: 1110, cs: 4, quantity: 1 }]);
  });
});
