// Condition state totals per element: quantities (ElementQuantity) and defect observations (Observation) are summed over
// the whole structure by elementNo (objects disappear in the sum). CS1 is not stored; it is derived from the total.
import type { ConditionState, ElementCondition, ElementQuantity, Observation } from './types';

/**
 * quantities/observations to ElementCondition[] per elementNo.
 * - total = sum of ElementQuantity.quantity of that elementNo (any object).
 * - cs[1..3] (CS2..CS4) = sum of Observation.quantity with that elementNo and cs
 *   (any object or defectNo: the same condition state lands in the same cell whatever the defect).
 * - cs[0] (CS1) = total - (cs[1]+cs[2]+cs[3]), floored at 0 (observations exceeding the total are an
 *   input consistency problem, not something this function resolves, so only a negative value is prevented).
 * - An elementNo missing from quantities (its total is undefined) does not appear in the result even
 *   when there are observations for it.
 */
export function aggregate(quantities: ElementQuantity[], observations: Observation[]): ElementCondition[] {
  const totals = new Map<number, number>();
  for (const q of quantities) {
    totals.set(q.elementNo, (totals.get(q.elementNo) ?? 0) + q.quantity);
  }

  // Sums per cs; the index is cs (2/3/4) - 2 = 0/1/2 (CS2..CS4). CS1 is not stored here and is derived later.
  const csSums = new Map<number, [number, number, number]>();
  for (const o of observations) {
    if (!totals.has(o.elementNo)) continue; // total undefined, not aggregated
    if (o.cs < 2) continue; // CS1 is derived, not observed, so it is ignored when given directly
    const arr = csSums.get(o.elementNo) ?? [0, 0, 0];
    arr[o.cs - 2] += o.quantity;
    csSums.set(o.elementNo, arr);
  }

  const result: ElementCondition[] = [];
  for (const [elementNo, total] of totals) {
    const [cs2, cs3, cs4] = csSums.get(elementNo) ?? [0, 0, 0];
    const cs1 = Math.max(0, total - (cs2 + cs3 + cs4));
    result.push({ elementNo, total, cs: [cs1, cs2, cs3, cs4] });
  }
  return result;
}

/* Worst (highest) condition state per object (objectCode); objects without observations are absent from the result. */
export function worstCsByObject(observations: Observation[]): Map<string, ConditionState> {
  const result = new Map<string, ConditionState>();
  for (const o of observations) {
    const prev = result.get(o.objectCode);
    if (prev === undefined || o.cs > prev) {
      result.set(o.objectCode, o.cs);
    }
  }
  return result;
}
