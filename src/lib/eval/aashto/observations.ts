// ------------------------------------------------------------------
//  Damage rows (database damages + damage_observations) to AASHTO observations (Observation): a pure conversion for the screens.
//
//  The rules match v_element_condition (the pipeline's db/schema.sql):
//    - for each active damage (no status = the database default 'active') the **single latest observation**
//      (later observed_at first, null last, smaller id on a tie = distinct on ... order by observed_at desc nulls last, id)
//    - damage to object to that object's element (the lowest element number when several). Damages on objects without an element are left out.
//    - condition_state 2-4 only (CS1 is derived from the total). An empty cs_quantity counts 0 (the total equals an SQL sum,
//      which skips null; the damage still counts for the worst CS).
//  Element totals, CS sums and NBI ratings are not computed here: the screens read v_element_condition and v_nbi_components.
//  This conversion feeds the 3D condition heatmap (worst CS per object) and the "worst defects" cell of the element table.
//  The inputs are minimal structural shapes (types/db.ts is not imported; this module has no outside dependency).
// ------------------------------------------------------------------
import type { ConditionState, Observation } from './types';

/* One observation: only the fields used from a damage_observations row */
export interface ObservationRowLike {
  id: string;
  observed_at: string | null;
  condition_state?: number | null;
  cs_quantity?: number | null;
}

/* One damage: only the fields used from a damages row (+ joined observations) */
export interface DamageRowLike {
  id: string;
  object_id: string | null;
  defect_no?: number | null;
  status?: string | null;
  damage_observations?: readonly ObservationRowLike[] | null;
}

/* timestamptz to an instant (ms). null when missing or unparsable (= nulls last) */
function instant(v: string | null): number | null {
  if (!v) return null;
  const ms = Date.parse(v);
  return Number.isNaN(ms) ? null : ms;
}

/* Does a come before b (is it newer): order by observed_at desc nulls last, id */
function newer(a: ObservationRowLike, b: ObservationRowLike): boolean {
  const ta = instant(a.observed_at);
  const tb = instant(b.observed_at);
  if (ta !== tb) {
    if (ta === null) return false;
    if (tb === null) return true;
    return ta > tb;
  }
  return a.id < b.id;
}

/* The single latest observation (null when there is none) */
export function latestObservation<T extends ObservationRowLike>(obs: readonly T[] | null | undefined): T | null {
  if (!obs || obs.length === 0) return null;
  return obs.reduce((best, o) => (newer(o, best) ? o : best));
}

/* Is the damage active: a missing status is the database default 'active' */
export function isActiveDamage(d: { status?: string | null }): boolean {
  return (d.status ?? 'active') === 'active';
}

/* object_elements rows to the element number per object id (the lowest when several, the view's rule) */
export function elementByObject(rows: ReadonlyArray<{ object_id: string; element_no: number }>): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    const prev = out.get(r.object_id);
    out.set(r.object_id, prev === undefined ? r.element_no : Math.min(prev, r.element_no));
  }
  return out;
}

const isCs = (v: number): v is ConditionState => v === 1 || v === 2 || v === 3 || v === 4;

/**
 * Damage rows to Observation[] (the view's rules; see the header). objectCode is objects.object_code (object_id when unknown).
 * @param objectCodeById objects.id → object_code
 * @param elementByObjectId objects.id to element number (result of elementByObject)
 */
export function observationsOf(
  damages: readonly DamageRowLike[],
  objectCodeById: ReadonlyMap<string, string>,
  elementByObjectId: ReadonlyMap<string, number>,
): Observation[] {
  const out: Observation[] = [];
  for (const d of damages) {
    if (!isActiveDamage(d) || d.object_id == null) continue;
    const elementNo = elementByObjectId.get(d.object_id);
    if (elementNo === undefined) continue; // damages on objects without an element are left out
    const latest = latestObservation(d.damage_observations);
    const cs = Number(latest?.condition_state);
    if (!latest || !isCs(cs) || cs < 2) continue;
    out.push({
      objectCode: objectCodeById.get(d.object_id) ?? d.object_id,
      elementNo,
      defectNo: d.defect_no ?? 0,
      cs,
      quantity: latest.cs_quantity ?? 0,
    });
  }
  return out;
}

/* One "worst defects" cell of the element table */
export interface WorstDefect {
  defectNo: number;
  cs: ConditionState;
  /* Sum of the quantity observed for that defect in its worst CS (element unit) */
  quantity: number;
}

/**
 * Element number to the worst CS of each defect and the quantity sum in that CS. Order: higher CS, then larger quantity, then defect number.
 * A defect observed in several CS counts only the quantity of its worst CS.
 */
export function worstDefectsByElement(observations: readonly Observation[]): Map<number, WorstDefect[]> {
  const byElement = new Map<number, Map<number, WorstDefect>>();
  for (const o of observations) {
    let defects = byElement.get(o.elementNo);
    if (!defects) byElement.set(o.elementNo, (defects = new Map()));
    const prev = defects.get(o.defectNo);
    if (!prev || o.cs > prev.cs) defects.set(o.defectNo, { defectNo: o.defectNo, cs: o.cs, quantity: o.quantity });
    else if (o.cs === prev.cs) prev.quantity += o.quantity;
  }
  const out = new Map<number, WorstDefect[]>();
  for (const [elementNo, defects] of byElement) {
    out.set(
      elementNo,
      [...defects.values()].sort((a, b) => b.cs - a.cs || b.quantity - a.quantity || a.defectNo - b.defectNo),
    );
  }
  return out;
}
