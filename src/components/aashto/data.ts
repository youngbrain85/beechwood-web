// ------------------------------------------------------------------
//  Shared derived values of the screens: unpacks the rows of four query hooks into the indexes, rows and observations the screens use.
//
//  Input: objects, damages (+ joined observations), object_elements, aashto_elements (hooks/useSupabase)
//  Output: object indexes (id, code), object to element, object to that element's quantity (total warning of the form), element library,
//        quantity rows (rows.ts damageRows), AASHTO observations (lib/eval/aashto observationsOf, the same rule as
//        v_element_condition), worst defects per element, worst CS per object (3D condition heatmap).
//  Element totals and NBI ratings are not made here: the screens read v_element_condition and v_nbi_components.
//  (data.test.ts checks with the real fixture that observations summed per element equal that view.)
// ------------------------------------------------------------------
import {
  elementByObject,
  observationsOf,
  worstDefectsByElement,
  type ConditionState,
  type Observation,
  type WorstDefect,
} from '@/lib/eval/aashto';
import type { AashtoElementRow, DamageWithDetails, ObjectElementRow, ObjectRow } from '@/types/db';
import { damageRows, worstCsForObjects, type AashtoDamageRow, type AashtoElementInfo } from './rows';

export interface AashtoData {
  objectById: Map<string, ObjectRow>;
  objectByCode: Map<string, ObjectRow>;
  elementByObjectId: Map<string, number>;
  /* Object id to the quantity of that object's element (the one elementByObjectId picks), object_elements.quantity; total warning of the form */
  elementQtyByObjectId: Map<string, number>;
  elements: Map<number, AashtoElementInfo>;
  rows: AashtoDamageRow[];
  observations: Observation[];
  worstDefects: Map<number, WorstDefect[]>;
  worstCs: Map<string, ConditionState | null>;
}

export function deriveAashtoData(input: {
  objects: readonly ObjectRow[];
  damages: readonly DamageWithDetails[];
  objectElements: readonly ObjectElementRow[];
  elements: readonly AashtoElementRow[];
}): AashtoData {
  const objectById = new Map(input.objects.map((o) => [o.id, o]));
  const objectByCode = new Map(input.objects.map((o) => [o.object_code, o]));
  const elementByObjectId = elementByObject(input.objectElements);
  // (object_id, element_no) is unique in the table (schema.sql unique): one row for the chosen element
  const elementQtyByObjectId = new Map<string, number>();
  for (const r of input.objectElements) {
    if (elementByObjectId.get(r.object_id) === r.element_no) elementQtyByObjectId.set(r.object_id, Number(r.quantity));
  }
  const elements = new Map<number, AashtoElementInfo>(
    input.elements.map((e) => [e.element_no, { name: e.name, unit: e.unit, category: e.category }]),
  );
  const codeById = new Map(input.objects.map((o) => [o.id, o.object_code]));
  const observations = observationsOf(input.damages, codeById, elementByObjectId);
  return {
    objectById,
    objectByCode,
    elementByObjectId,
    elementQtyByObjectId,
    elements,
    rows: damageRows(input.damages, { objectById, elementByObjectId, elements }),
    observations,
    worstDefects: worstDefectsByElement(observations),
    worstCs: worstCsForObjects(input.objects, elementByObjectId, observations),
  };
}
