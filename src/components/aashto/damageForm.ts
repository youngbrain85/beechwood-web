// ------------------------------------------------------------------
//  AASHTO damage form rules (pure): one damage plus one observation on the object chosen in the 3D view.
//
//  - Defect options = defects that apply to the category of the object's element (deck, super, sub, other; lib/eval/aashto defectsForCategory).
//    Objects without an element (cross-frames, diaphragms, stubs) are filtered by component category (members.category): the
//    record is kept but does not enter v_element_condition (the form says so).
//  - The quantity unit is fixed to the element unit: the view sums cs_quantity in the element unit, so a mixed unit would break the total.
//  - The quantity must be above 0 (validation). Above the element total of the object (object_elements.quantity) it only
//    warns (quantityWarning); registering is not blocked.
//  - Stored values: fault_type = defect name, defect_no, condition_state, cs_quantity, cs_unit.
//    The size and grade columns (width, length, count, grade) stay empty and cnt is 1. No round is passed: registerDamage
//    uses the default round of the bridge profile.
// ------------------------------------------------------------------
import type { NewDamageInput } from '@/hooks/useSupabase';
import { SEval } from '@/i18n/s.eval';
import { defectsForCategory, type ConditionState, type DefectDef, type ElementCategory } from '@/lib/eval/aashto';
import type { DamagePosition } from '@/types/db';
import { formatQty } from './format';
import type { AashtoElementInfo } from './rows';

export interface AashtoFormContext {
  element: ({ no: number } & AashtoElementInfo) | null;
  /* Element total of the object (object_elements.quantity, element unit); a larger quantity warns. null for an object without an element or when unknown */
  elementTotal: number | null;
  /* Category the defect options were filtered by: element category, else component category, else null (all) */
  category: ElementCategory | null;
  defects: DefectDef[];
  /* Element unit (fixed). null for an object without an element, where the form lets the user choose */
  lockedUnit: string | null;
}

/* members.category (Deck, Superstructure, Substructure, Other) to element category */
const MEMBER_CATEGORY: Readonly<Record<string, ElementCategory>> = {
  Deck: 'deck',
  Superstructure: 'super',
  Substructure: 'sub',
  Other: 'other',
};

/**
 * @param elementQtyByObjectId object id to the quantity of that object's element (data.ts elementQtyByObjectId; object_elements.quantity).
 *   When absent the total is treated as unknown and nothing warns.
 */
export function formContext(
  objectId: string,
  elementByObjectId: ReadonlyMap<string, number>,
  elements: ReadonlyMap<number, AashtoElementInfo>,
  memberCategory: string | null | undefined,
  elementQtyByObjectId?: ReadonlyMap<string, number>,
): AashtoFormContext {
  const no = elementByObjectId.get(objectId);
  const info = no === undefined ? undefined : elements.get(no);
  const element = no !== undefined && info ? { no, ...info } : null;
  const category =
    element?.category ??
    (memberCategory && Object.prototype.hasOwnProperty.call(MEMBER_CATEGORY, memberCategory)
      ? MEMBER_CATEGORY[memberCategory]!
      : null);
  return {
    element,
    elementTotal: (element && elementQtyByObjectId?.get(objectId)) ?? null,
    category,
    defects: defectsForCategory(category),
    lockedUnit: element?.unit ?? null,
  };
}

/**
 * Non-blocking warning: a text when the quantity exceeds the element total of the object (total in the on-screen format and element unit), else null.
 * A CS quantity on one damage larger than the whole element of that object is usually a typing mistake (digits, unit). Validation
 * (buildAashtoDamage) checks quantity > 0 only; this warning never blocks registering.
 */
export function quantityWarning(values: AashtoFormValues, ctx: AashtoFormContext): string | null {
  if (!ctx.element || ctx.elementTotal === null || typeof values.quantity !== 'number') return null;
  return values.quantity > ctx.elementTotal
    ? SEval.form.warnOverTotal(formatQty(ctx.elementTotal), ctx.element.unit)
    : null;
}

/* Form values; NumberInput gives '' when emptied */
export interface AashtoFormValues {
  defectNo: number | null;
  cs: ConditionState | null;
  quantity: number | '';
  unit: string | null;
  notes: string;
}

export type AashtoFormResult = { ok: true; input: NewDamageInput } | { ok: false; error: string };

/* Validation, then the registerDamage input. Errors are returned as the s.eval texts. */
export function buildAashtoDamage(
  values: AashtoFormValues,
  ctx: AashtoFormContext,
  target: { bridgeId: string; objectId: string; position: DamagePosition },
): AashtoFormResult {
  const defect = ctx.defects.find((d) => d.no === values.defectNo);
  if (!defect) return { ok: false, error: SEval.form.errDefect };
  if (values.cs === null) return { ok: false, error: SEval.form.errCs };
  if (typeof values.quantity !== 'number' || !(values.quantity > 0)) return { ok: false, error: SEval.form.errQuantity };
  const unit = ctx.lockedUnit ?? values.unit;
  if (!unit) return { ok: false, error: SEval.form.errUnit };
  return {
    ok: true,
    input: {
      bridgeId: target.bridgeId,
      objectId: target.objectId,
      faultType: defect.name,
      position: target.position,
      widthMm: null,
      lengthM: null,
      cnt: 1,
      quantity: null,
      grade: null,
      note: values.notes.trim(),
      defectNo: defect.no,
      conditionState: values.cs,
      csQuantity: values.quantity,
      csUnit: unit,
    },
  };
}
