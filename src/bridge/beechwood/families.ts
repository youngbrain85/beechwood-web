// ------------------------------------------------------------------
//  Fine member to the sheet families that draw it (database sheets.zone_type = the seven member names).
//
//  The "existing sheets" hint of the sheet proposal screen only examines sheets of a matching family.
//  The groups were read from the per-sheet object lists of the pipeline's mangdo/sheets_index.json:
//    - Pier diaphragms (BW_DIA) are drawn on both beam sheets (between beam ends) and bent sheets
//    - End bent caps (BW_EB*_CAP) are also drawn on beam sheets (EXT/INT/SOF) as bearing seats: beams and end bents
//    - Drilled shaft stubs (BW_SHAFT) are main objects of the interior bent sheets (BW-BENT-2/3)
//    - Expansion joints (BW_JT) are on both the approach sheets and the bearing/joint plan (BW-BRG-JT)
//    - H-pile stubs (BW_PILE) are buried and drawn on no sheet (end bent sheet note "buried")
//  The result has no duplicates and follows the member tree order (objects.ts BW_MEMBERS). The module top level holds only literals and functions.
// ------------------------------------------------------------------
import { BW_MEMBERS } from './objects';

const FAMILY_BY_FINE: Readonly<Record<string, readonly string[]>> = {
  'Deck slab': ['Deck'],
  'PSC bulb-tee beam': ['Beams'],
  'Steel cross-frame': ['Beams'],
  'Pier diaphragm': ['Beams', 'Interior bents'],
  'Pier cap': ['Interior bents'],
  Column: ['Interior bents'],
  'Debris wall': ['Interior bents'],
  'Drilled shaft (stub)': ['Interior bents'],
  'Integral end bent cap': ['Beams', 'End bents'],
  'Wing wall': ['End bents'],
  'Elastomeric bearing': ['Bearings'],
  'Concrete barrier rail (Type FC)': ['Railing'],
  'Approach slab': ['Approach & joints'],
  'Expansion joint': ['Bearings', 'Approach & joints'],
};

/* Selected meshes to sheet families (no duplicates, member tree order). Fine members missing from the table (H-pile stubs, ground, Other) have no family. */
export function familiesFor(meshes: Array<{ name: string; fine: string }>): string[] {
  const found = new Set<string>();
  for (const m of meshes) {
    for (const f of Object.prototype.hasOwnProperty.call(FAMILY_BY_FINE, m.fine) ? FAMILY_BY_FINE[m.fine]! : []) found.add(f);
  }
  return BW_MEMBERS.filter((f) => found.has(f));
}
