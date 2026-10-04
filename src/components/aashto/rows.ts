// ------------------------------------------------------------------
//  Damage rows, groups and 3D heatmap states of the screens (pure).
//
//  One damage = the latest observation of an active damage (the same rule as v_element_condition; lib/eval/aashto/observations.ts).
//  Columns match the printed sheet table "ELEMENT CONDITION QUANTITIES": No. / Element / Defect / CS / Qty / Unit / Notes.
//    - No.     = damages.position.seq (damage number within the sheet, the same number as the sheet marker)
//    - Element = the object's element (the lowest number when several, the view's rule); empty for an object without one
//    - Defect  = name from the defect library (else the stored fault_type)
//    - CS/Qty  = condition_state and cs_quantity of the latest observation
//    - Unit    = observation unit (cs_unit), else the element unit
//    - Notes   = location (fault_detail), then the observation note
//  Element totals and NBI ratings are not made here (the screens read v_element_condition and v_nbi_components).
// ------------------------------------------------------------------
import {
  DEFECTS,
  isActiveDamage,
  latestObservation,
  worstCsByObject,
  type ConditionState,
  type ElementCategory,
  type Observation,
} from '@/lib/eval/aashto';
import { naturalCompare } from '@/lib/proposal/title';
import type { DamageWithDetails, ObjectRow, SheetRow } from '@/types/db';

/* One element library entry (the fields the screens use), from an aashto_elements row */
export interface AashtoElementInfo {
  name: string;
  unit: string;
  category: ElementCategory;
}

/* One quantity table row */
export interface AashtoDamageRow {
  id: string;
  no: number | null;
  objectId: string | null;
  objectCode: string;
  sheetId: string | null;
  elementNo: number | null;
  elementName: string | null;
  category: ElementCategory | null;
  defectNo: number | null;
  defectName: string;
  cs: ConditionState | null;
  qty: number | null;
  unit: string | null;
  notes: string;
  observedAt: string | null;
  round: string | null;
}

export interface RowContext {
  objectById: ReadonlyMap<string, Pick<ObjectRow, 'object_code'>>;
  elementByObjectId: ReadonlyMap<string, number>;
  elements: ReadonlyMap<number, AashtoElementInfo>;
}

const asCs = (v: number | null | undefined): ConditionState | null =>
  v === 1 || v === 2 || v === 3 || v === 4 ? v : null;

/* Active damages to quantity rows (input order kept) */
export function damageRows(damages: readonly DamageWithDetails[], ctx: RowContext): AashtoDamageRow[] {
  const out: AashtoDamageRow[] = [];
  for (const d of damages) {
    if (!isActiveDamage(d)) continue;
    const latest = latestObservation(d.damage_observations);
    const elementNo = d.object_id ? (ctx.elementByObjectId.get(d.object_id) ?? null) : null;
    const element = elementNo === null ? undefined : ctx.elements.get(elementNo);
    const defectNo = d.defect_no ?? null;
    const defect = defectNo === null ? undefined : DEFECTS.find((x) => x.no === defectNo);
    out.push({
      id: d.id,
      no: d.position?.seq ?? null,
      objectId: d.object_id,
      objectCode: (d.object_id && ctx.objectById.get(d.object_id)?.object_code) || '',
      sheetId: d.sheet_id,
      elementNo,
      elementName: element?.name ?? null,
      category: element?.category ?? null,
      defectNo,
      defectName: defect?.name ?? d.fault_type,
      cs: asCs(latest?.condition_state),
      qty: latest?.cs_quantity ?? null,
      unit: latest?.cs_unit ?? element?.unit ?? null,
      notes: [d.fault_detail?.trim(), latest?.note?.trim()].filter((s): s is string => !!s).join(' — '),
      observedAt: latest?.observed_at ?? null,
      round: d.inspections?.round_label ?? null,
    });
  }
  return out;
}

/* One group; label null = damages on no sheet (registered in the 3D view) */
export interface RowGroup {
  key: string;
  label: string | null;
  rows: AashtoDamageRow[];
}

/* Order inside a group: No. (missing last), then observation time, then id */
function byNo(a: AashtoDamageRow, b: AashtoDamageRow): number {
  const na = a.no ?? Number.POSITIVE_INFINITY;
  const nb = b.no ?? Number.POSITIVE_INFINITY;
  if (na !== nb) return na - nb;
  return (a.observedAt ?? '').localeCompare(b.observedAt ?? '') || a.id.localeCompare(b.id);
}

/**
 * Groups by object (natural order of object codes) or by sheet (sort_no order, damages without a sheet in one last group).
 */
export function groupRows(
  rows: readonly AashtoDamageRow[],
  by: 'object' | 'sheet',
  sheetsById: ReadonlyMap<string, Pick<SheetRow, 'title' | 'sort_no'>>,
): RowGroup[] {
  const groups = new Map<string, RowGroup>();
  for (const r of rows) {
    const key = by === 'object' ? r.objectCode : (r.sheetId ?? '');
    const label = by === 'object' ? r.objectCode : r.sheetId ? (sheetsById.get(r.sheetId)?.title ?? r.sheetId) : null;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { key: key || '—', label, rows: [] }));
    g.rows.push(r);
  }
  const list = [...groups.values()];
  for (const g of list) g.rows.sort(byNo);
  if (by === 'object') return list.sort((a, b) => naturalCompare(a.label ?? '', b.label ?? ''));
  const order = (g: RowGroup): number =>
    g.label === null ? Number.POSITIVE_INFINITY : (sheetsById.get(g.rows[0]!.sheetId ?? '')?.sort_no ?? Number.MAX_SAFE_INTEGER);
  return list.sort((a, b) => order(a) - order(b) || naturalCompare(a.label ?? '', b.label ?? ''));
}

/**
 * 3D condition heatmap: object code to worst CS. An element with no observation is CS1 (the whole quantity is CS1);
 * an object without an element is null (not rated: cross-frames, stubs and so on).
 * observations is the observationsOf result (latest observations of active damages on objects with an element, CS2-CS4).
 */
export function worstCsForObjects(
  objects: ReadonlyArray<Pick<ObjectRow, 'id' | 'object_code'>>,
  elementByObjectId: ReadonlyMap<string, number>,
  observations: readonly Observation[],
): Map<string, ConditionState | null> {
  const worst = worstCsByObject([...observations]);
  const out = new Map<string, ConditionState | null>();
  for (const o of objects) {
    out.set(o.object_code, elementByObjectId.has(o.id) ? (worst.get(o.object_code) ?? 1) : null);
  }
  return out;
}

/* Heatmap legend counts: CS1-CS4 and no element (none) */
export function csCounts(m: ReadonlyMap<string, ConditionState | null>): Record<ConditionState | 'none', number> {
  const c: Record<ConditionState | 'none', number> = { 1: 0, 2: 0, 3: 0, 4: 0, none: 0 };
  for (const v of m.values()) c[v ?? 'none'] += 1;
  return c;
}

/* Condition state of one damage: condition_state of the latest observation (3D marker color). null when missing or empty. */
export function damageCs(d: Pick<DamageWithDetails, 'damage_observations'>): ConditionState | null {
  return asCs(latestObservation(d.damage_observations)?.condition_state);
}
