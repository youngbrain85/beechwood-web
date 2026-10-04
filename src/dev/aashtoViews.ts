// ------------------------------------------------------------------
//  Computed views of fixture mode — v_element_condition · v_nbi_components.
//
//  The reference for the rules is the two view definitions in the pipeline's db/schema.sql (this must match them):
//    - total   = sum of object_elements.quantity per element, only elements in the element library (aashto_elements; inner join)
//    - CS2-CS4 = for each active damage (status = 'active'; a session insert has no status and counts as the database default active)
//                the cs_quantity of its **latest observation** (later observed_at first, null last, smaller id on a tie = distinct on)
//                is added to the column of its condition_state (cs_quantity null and condition_state 1/null count 0).
//                Damage to object to that object's element (the lowest element number when several). Damages on objects without an element are left out.
//    - CS1     = total - sum(CS2..CS4), floored at 0
//    - element rating (v_element_condition.rating, the last column) = the element's own ladder: share = CS quantity / that element's total
//    - component rating (v_nbi_components; only the columns component and rating) = three rows deck, super, sub (even without elements),
//                the minimum element rating of the elements (total > 0) in that category, else 9. Quantities of elements with different units are never added.
//  Summing and rating use aggregate, elementRating and componentRating of lib/eval/aashto as is (the rules are not duplicated).
//  Mimicking PostgreSQL numeric, quantities round to 6 decimals (like _num in the seed script); the element rating
//  is computed from the rounded values the view returns (rating again from the rows alone gives the same result).
//
//  Verification only (src/dev) — not part of the production bundle. fakeSupabase.ts wires it.
// ------------------------------------------------------------------
import {
  aggregate,
  componentRating,
  elementRating,
  type Component,
  type ConditionState,
  type ElementCondition,
  type ElementQuantity,
  type Observation,
} from '@/lib/eval/aashto';
import type { ElementConditionRow, NbiComponentRow } from '@/types/db';
import type { FakeView } from './fakeClient';

type Row = Record<string, unknown>;
type Read = (table: string) => Promise<Row[]>;

/* Component order of the view: schema.sql values ('deck',1),('super',2),('sub',3) */
const NBI_COMPONENTS: Component[] = ['deck', 'super', 'sub'];

/* Mimics numeric: rounds to 6 decimals (removes float residue) */
const r6 = (x: number): number => Math.round(x * 1e6) / 1e6;

/* timestamptz values compare as instants, not strings; null when missing or unparsable (= nulls last) */
function instant(v: unknown): number | null {
  if (typeof v !== 'string') return null;
  const ms = Date.parse(v);
  return Number.isNaN(ms) ? null : ms;
}

/* Does a come before b: order by observed_at desc nulls last, id */
function before(a: Row, b: Row): boolean {
  const ta = instant(a.observed_at);
  const tb = instant(b.observed_at);
  if (ta !== tb) {
    if (ta === null) return false;
    if (tb === null) return true;
    return ta > tb;
  }
  return String(a.id) < String(b.id);
}

/**
 * Damage id to its observations. The snapshot nests observations in damages[].damage_observations (the useDamages join shape),
 * and observations registered during the session go to the top-level damage_observations table; both are merged, counting each observation id once.
 */
async function observationsByDamage(read: Read, damages: Row[]): Promise<Map<string, Row[]>> {
  const byId = new Map<string, { damageId: string; ob: Row }>();
  for (const d of damages) {
    for (const ob of (d.damage_observations as Row[] | undefined) ?? []) {
      byId.set(String(ob.id), { damageId: String(ob.damage_id ?? d.id), ob });
    }
  }
  for (const ob of await read('damage_observations')) byId.set(String(ob.id), { damageId: String(ob.damage_id), ob });

  const out = new Map<string, Row[]>();
  for (const { damageId, ob } of byId.values()) {
    const list = out.get(damageId);
    if (list) list.push(ob);
    else out.set(damageId, [ob]);
  }
  return out;
}

/* v_element_condition: total and CS1-CS4 per element (ascending element_no) */
export async function elementConditionRows(read: Read): Promise<ElementConditionRow[]> {
  const [elements, objectElements, damages] = await Promise.all([
    read('aashto_elements'),
    read('object_elements'),
    read('damages'),
  ]);
  const lib = new Map(elements.map((e) => [Number(e.element_no), e]));

  // Object to element (the lowest element number when several)
  const elementOf = new Map<string, number>();
  const quantities: ElementQuantity[] = objectElements.map((oe) => {
    const objectId = String(oe.object_id);
    const no = Number(oe.element_no);
    elementOf.set(objectId, Math.min(elementOf.get(objectId) ?? no, no));
    // aggregate does not read objectCode (it sums by element number only); object_id is carried for tracing.
    return { objectCode: objectId, elementNo: no, quantity: Number(oe.quantity) };
  });

  const obsOf = await observationsByDamage(read, damages);
  const observations: Observation[] = [];
  for (const d of damages) {
    if ((d.status ?? 'active') !== 'active') continue;
    const obs = obsOf.get(String(d.id));
    if (!obs?.length) continue;
    const latest = obs.reduce((best, ob) => (before(ob, best) ? ob : best));
    const elementNo = d.object_id == null ? undefined : elementOf.get(String(d.object_id));
    if (elementNo === undefined) continue; // damages on objects without an element are left out
    const cs = Number(latest.condition_state);
    if (cs !== 2 && cs !== 3 && cs !== 4) continue; // filter (where condition_state = 2|3|4)
    if (latest.cs_quantity == null) continue; // sum skips null
    observations.push({
      objectCode: String(d.object_id),
      elementNo,
      defectNo: Number(d.defect_no ?? 0),
      cs: cs as ConditionState,
      quantity: Number(latest.cs_quantity),
    });
  }

  return aggregate(quantities, observations)
    .filter((c) => lib.has(c.elementNo))
    .sort((a, b) => a.elementNo - b.elementNo)
    .map((c) => {
      const e = lib.get(c.elementNo)!;
      // Rows are built from the numeric-like values (6 decimals), and the element rating is computed from them too
      const q: ElementCondition = {
        elementNo: c.elementNo,
        total: r6(c.total),
        cs: [r6(c.cs[0]), r6(c.cs[1]), r6(c.cs[2]), r6(c.cs[3])],
      };
      return {
        element_no: q.elementNo,
        name: String(e.name),
        unit: e.unit as ElementConditionRow['unit'],
        category: e.category as ElementConditionRow['category'],
        total_qty: q.total,
        cs1: q.cs[0],
        cs2: q.cs[1],
        cs3: q.cs[2],
        cs4: q.cs[3],
        rating: elementRating(q),
      };
    });
}

/* v_nbi_components: three rows deck, super, sub with the columns component and rating (componentRating = minimum element rating) */
export async function nbiComponentRows(read: Read): Promise<NbiComponentRow[]> {
  const rows = await elementConditionRows(read);
  return NBI_COMPONENTS.map((component) => {
    // Grouped by element category like the SQL; the same grouping as lib/eval/aashto COMPONENT_OF (checked by the fixture test)
    const conds: ElementCondition[] = rows
      .filter((r) => r.category === component)
      .map((r) => ({ elementNo: r.element_no, total: r.total_qty, cs: [r.cs1, r.cs2, r.cs3, r.cs4] }));
    return { component, rating: componentRating(conds, component) };
  });
}

/** The views option of fakeClient — passed by fakeSupabase.ts */
export const AASHTO_VIEWS: Record<string, FakeView> = {
  v_element_condition: elementConditionRows,
  v_nbi_components: nbiComponentRows,
};
