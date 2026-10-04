// GLB node names (BW_...) to member info. Node name = objects.json id = database object_code (1:1).
// Fixture: a copy of the 80 ids of the pipeline's model/out/objects.json (__fixtures__/objects.ids.json).
import { describe, expect, it } from 'vitest';
import ids from './__fixtures__/objects.ids.json';
import { BW_FINE_PARTS, BW_MEMBERS, isGround, objectInfo } from './objects';

const at = { x: 0, z: 0 };

describe('objectInfo: decoding by id grammar', () => {
  // [id, member, fine member, location]
  const cases: Array<[string, string, string, string]> = [
    ['BW_DECK_B', 'Deck', 'Deck slab', 'Span B'],
    ['BW_BEAM_B2', 'Beams', 'PSC bulb-tee beam', 'Span B, beam line 2'],
    ['BW_XF_C', 'Beams', 'Steel cross-frame', 'Span C, mid-span'],
    ['BW_DIA_B3', 'Interior bents', 'Pier diaphragm', 'Bent 3'],
    ['BW_CAP_B2', 'Interior bents', 'Pier cap', 'Bent 2'],
    ['BW_COL_B3_1', 'Interior bents', 'Column', 'Bent 3, column 1'],
    ['BW_WALL_B2', 'Interior bents', 'Debris wall', 'Bent 2'],
    ['BW_SHAFT_B2_2', 'Interior bents', 'Drilled shaft (stub)', 'Bent 2, shaft 2'],
    ['BW_EB1_CAP', 'End bents', 'Integral end bent cap', 'End Bent 1'],
    ['BW_EB4_WING_C', 'End bents', 'Wing wall', 'End Bent 4, wing C'],
    ['BW_PILE_EB4_6', 'End bents', 'Steel H-pile (stub)', 'End Bent 4, pile 6'],
    ['BW_BRG_B2_3N', 'Bearings', 'Elastomeric bearing', 'Bent 2, beam line 3, north'],
    ['BW_BRG_B3_1S', 'Bearings', 'Elastomeric bearing', 'Bent 3, beam line 1, south'],
    ['BW_BRG_EB1_2', 'Bearings', 'Elastomeric bearing', 'End Bent 1, beam line 2'],
    ['BW_RAIL_L', 'Railing', 'Concrete barrier rail (Type FC)', 'Left (west)'],
    ['BW_RAIL_R', 'Railing', 'Concrete barrier rail (Type FC)', 'Right (east)'],
    ['BW_APPR_S', 'Approach & joints', 'Approach slab', 'South approach'],
    ['BW_APPR_N', 'Approach & joints', 'Approach slab', 'North approach'],
    ['BW_JT_S', 'Approach & joints', 'Expansion joint', 'South end'],
    ['BW_JT_N', 'Approach & joints', 'Expansion joint', 'North end'],
  ];

  it.each(cases)('%s → %s · %s · %s', (id, memberName, fine, locationDetail) => {
    expect(objectInfo('BEECHWOOD', id, at)).toEqual({
      member: null,
      memberName,
      fine,
      locationDetail,
      objectCode: id,
    });
  });

  it('member is always null; the member name goes in memberName', () => {
    for (const id of ids) expect(objectInfo('BEECHWOOD', id, at).member).toBeNull();
  });

  it('does not depend on the group name or the pick point (the node name alone decides)', () => {
    expect(objectInfo('X', 'BW_BRG_B2_3N', { x: -9, z: 40 })).toEqual(objectInfo('BEECHWOOD', 'BW_BRG_B2_3N', at));
  });
});

describe('objectInfo: things that are not objects', () => {
  // Three ground meshes: flat ground (BW_GROUND) + end bent fills south (BW_GROUND_S, EB1) and north (BW_GROUND_N, EB4).
  // Only in the GLB, not in objects.json or the database (pipeline build_beechwood NON_OBJECT_MESHES).
  it.each(['BW_GROUND', 'BW_GROUND_S', 'BW_GROUND_N'])('%s (ground) is not an object: no member, empty objectCode', (id) => {
    expect(objectInfo('BEECHWOOD', id, at)).toEqual({
      member: null,
      fine: 'Ground',
      locationDetail: '',
      objectCode: '',
    });
    expect(isGround(id)).toBe(true);
  });

  it('the rule covers every BW_GROUND* (also fills added later); objects, ids outside the grammar and other prefixes are not ground', () => {
    expect(isGround('BW_GROUND_E')).toBe(true);
    for (const id of ['BW_DECK_A', 'BW_FOO_1', 'GROUND', 'bw_ground', 'XBW_GROUND']) expect(isGround(id)).toBe(false);
  });

  it.each(['BW_FOO_1', 'BW_DECK_D', 'BW_BEAM_A5', 'BW_CAP_B4', 'BW_EB2_CAP', 'BW_BRG_B2_1'])(
    'outside the grammar: %s gives Other, objectCode is the node name as is',
    (id) => {
      expect(objectInfo('BEECHWOOD', id, at)).toEqual({
        member: null,
        fine: 'Other',
        locationDetail: '',
        objectCode: id,
      });
    },
  );
});

describe('objectInfo: all 80 model ids', () => {
  it('the fixture holds the 80 ids of objects.json', () => {
    expect(ids).toHaveLength(80);
    expect(new Set(ids).size).toBe(80);
  });

  it('all decode within the seven members and 15 fine members, objectCode = id', () => {
    for (const id of ids) {
      const info = objectInfo('BEECHWOOD', id, at);
      expect(BW_MEMBERS).toContain(info.memberName);
      expect(BW_FINE_PARTS).toContain(info.fine);
      expect(info.objectCode).toBe(id);
      expect(info.locationDetail).not.toBe('');
    }
  });

  it('counts per member: Deck 3, Beams 15, Interior bents 14, End bents 18, Bearings 24, Railing 2, Approach & joints 4', () => {
    const count = new Map<string, number>();
    for (const id of ids) {
      const m = objectInfo('BEECHWOOD', id, at).memberName ?? '';
      count.set(m, (count.get(m) ?? 0) + 1);
    }
    expect(Object.fromEntries(count)).toEqual({
      Deck: 3,
      Beams: 15,
      'Interior bents': 14,
      'End bents': 18,
      Bearings: 24,
      Railing: 2,
      'Approach & joints': 4,
    });
  });

  it('all 15 fine members are used', () => {
    const used = new Set(ids.map((id) => objectInfo('BEECHWOOD', id, at).fine));
    expect([...used].sort()).toEqual([...BW_FINE_PARTS].sort());
  });

  it('member order (top-level tree order)', () => {
    expect(BW_MEMBERS).toEqual([
      'Deck',
      'Beams',
      'Interior bents',
      'End bents',
      'Bearings',
      'Railing',
      'Approach & joints',
    ]);
  });
});
