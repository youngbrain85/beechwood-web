// ------------------------------------------------------------------
//  GLB node names (BW_...) to member info.
//
//  Node name = objects.json id = database object_code (1:1), so objectCode is simply
//  the node name.
//  id grammar (drawing reference: docs/dimensions.md of the pipeline repository):
//    BW_DECK_{A|B|C} · BW_BEAM_{A|B|C}{1-4} · BW_XF_{A|B|C} · BW_DIA_B{2|3}
//    BW_CAP_B{2|3} · BW_COL_B{2|3}_{1|2} · BW_WALL_B{2|3} · BW_SHAFT_B{2|3}_{1|2}
//    BW_EB{1|4}_CAP · BW_EB{1|4}_WING_{A-D} · BW_PILE_EB{1|4}_{1-6}
//    BW_BRG_B{2|3}_{1-4}{S|N} · BW_BRG_EB{1|4}_{1-4} · BW_RAIL_{L|R} · BW_APPR_{S|N} · BW_JT_{S|N}
//    BW_GROUND* : ground (not an object): flat ground BW_GROUND + end bent fills BW_GROUND_S (EB1), BW_GROUND_N (EB4).
//      Only in the GLB, not in objects.json, the database or the manifest: absent from the tree and not pickable in 3D (loader.ts).
//  Decoded by **grammar**, not from a fixed list (substructure ids are added on the pipeline side).
//  An id outside the grammar is exposed as 'Other', so it never silently joins the wrong member.
//
//  Orientation: +z = increasing station = north, +x = east (right when looking up-station). S/N = south/north, L/R = west/east.
//  All display strings are the stored English names.
// ------------------------------------------------------------------
import type { ObjectInfo } from '../types';

/* The seven members, in the top-level order of the member tree. */
export const BW_MEMBERS = [
  'Deck',
  'Beams',
  'Interior bents',
  'End bents',
  'Bearings',
  'Railing',
  'Approach & joints',
] as const;
export type BwMember = (typeof BW_MEMBERS)[number];

/* The 15 fine members (those attached to objects). Ground ('Ground') and outside-grammar ('Other') are not objects and are not listed. */
export const BW_FINE_PARTS = [
  'Deck slab',
  'PSC bulb-tee beam',
  'Steel cross-frame',
  'Pier diaphragm',
  'Pier cap',
  'Column',
  'Debris wall',
  'Drilled shaft (stub)',
  'Integral end bent cap',
  'Wing wall',
  'Elastomeric bearing',
  'Concrete barrier rail (Type FC)',
  'Approach slab',
  'Expansion joint',
  'Steel H-pile (stub)',
] as const;
export type BwFinePart = (typeof BW_FINE_PARTS)[number] | 'Ground' | 'Other';

/* Decoded result: [member, fine member, location] */
type Decoded = readonly [BwMember, BwFinePart, string];

/* S/N to 'South'/'North' */
const southOrNorth = (c: string | undefined): string => (c === 'S' ? 'South' : 'North');

/* One grammar line = [regex, decoder]. The first matching line from the top is used. */
const RULES: ReadonlyArray<readonly [RegExp, (m: RegExpExecArray) => Decoded]> = [
  [/^BW_DECK_([ABC])$/, (m) => ['Deck', 'Deck slab', `Span ${m[1]}`]],
  [/^BW_BEAM_([ABC])([1-4])$/, (m) => ['Beams', 'PSC bulb-tee beam', `Span ${m[1]}, beam line ${m[2]}`]],
  // Steel cross-frames: one at the middle of each span (the drawings show Span B only; assumed for all spans, dimensions.md 3.3)
  [/^BW_XF_([ABC])$/, (m) => ['Beams', 'Steel cross-frame', `Span ${m[1]}, mid-span`]],
  [/^BW_DIA_B([23])$/, (m) => ['Interior bents', 'Pier diaphragm', `Bent ${m[1]}`]],
  [/^BW_CAP_B([23])$/, (m) => ['Interior bents', 'Pier cap', `Bent ${m[1]}`]],
  [/^BW_COL_B([23])_([12])$/, (m) => ['Interior bents', 'Column', `Bent ${m[1]}, column ${m[2]}`]],
  [/^BW_WALL_B([23])$/, (m) => ['Interior bents', 'Debris wall', `Bent ${m[1]}`]],
  [/^BW_SHAFT_B([23])_([12])$/, (m) => ['Interior bents', 'Drilled shaft (stub)', `Bent ${m[1]}, shaft ${m[2]}`]],
  [/^BW_EB([14])_CAP$/, (m) => ['End bents', 'Integral end bent cap', `End Bent ${m[1]}`]],
  [/^BW_EB([14])_WING_([A-D])$/, (m) => ['End bents', 'Wing wall', `End Bent ${m[1]}, wing ${m[2]}`]],
  [/^BW_PILE_EB([14])_([1-6])$/, (m) => ['End bents', 'Steel H-pile (stub)', `End Bent ${m[1]}, pile ${m[2]}`]],
  // Bearings: interior bents have one per beam end (south/north), 8 in all; end bents have one per beam, 4 in all
  [
    /^BW_BRG_B([23])_([1-4])([SN])$/,
    (m) => ['Bearings', 'Elastomeric bearing', `Bent ${m[1]}, beam line ${m[2]}, ${southOrNorth(m[3]).toLowerCase()}`],
  ],
  [/^BW_BRG_EB([14])_([1-4])$/, (m) => ['Bearings', 'Elastomeric bearing', `End Bent ${m[1]}, beam line ${m[2]}`]],
  [
    /^BW_RAIL_([LR])$/,
    (m) => ['Railing', 'Concrete barrier rail (Type FC)', m[1] === 'L' ? 'Left (west)' : 'Right (east)'],
  ],
  [/^BW_APPR_([SN])$/, (m) => ['Approach & joints', 'Approach slab', `${southOrNorth(m[1])} approach`]],
  [/^BW_JT_([SN])$/, (m) => ['Approach & joints', 'Expansion joint', `${southOrNorth(m[1])} end`]],
];

/* Is it a ground mesh: every BW_GROUND* (flat ground, fills S/N and fills added later). Not an object. */
export function isGround(objName: string): boolean {
  return objName.startsWith('BW_GROUND');
}

/**
 * Group name + node name to member info.
 * The node name alone decides; the group (GLB file identifier) and the pick point are not used.
 * member is always null; the member name goes in memberName.
 * Ground (BW_GROUND*) gives fine 'Ground' and objectCode '', which the loader uses to exclude it from picking (lib/glb/loader.ts tagMeshes).
 */
export function objectInfo(
  _group: string,
  objName: string,
  _center: { x: number; z: number },
): ObjectInfo<BwFinePart> {
  if (isGround(objName)) return { member: null, fine: 'Ground', locationDetail: '', objectCode: '' };
  for (const [re, decode] of RULES) {
    const m = re.exec(objName);
    if (m) {
      const [memberName, fine, locationDetail] = decode(m);
      return { member: null, memberName, fine, locationDetail, objectCode: objName };
    }
  }
  return { member: null, fine: 'Other', locationDetail: '', objectCode: objName };
}
