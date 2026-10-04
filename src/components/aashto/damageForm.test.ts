// ------------------------------------------------------------------
//  AASHTO damage form (pure rules): defect options are filtered by the category of the object's element; carries CS 1-4 and quantity + unit.
//  The unit is fixed to the element unit (v_element_condition sums in the element unit, so a mixed unit would break the total).
//  Objects without an element (cross-frames, diaphragms, stubs) are filtered by component category and let the user pick a unit: the record is kept but stays out of element condition.
//  A quantity above the element total of the object (object_elements.quantity) only warns (not blocking; only quantity > 0 is required).
// ------------------------------------------------------------------
import { describe, expect, it } from 'vitest';
import { SEval } from '@/i18n/s.eval';
import { buildAashtoDamage, formContext, quantityWarning, type AashtoFormValues } from './damageForm';
import type { AashtoElementInfo } from './rows';

const ELEMENTS: Map<number, AashtoElementInfo> = new Map([
  [12, { name: 'Reinforced Concrete Deck', unit: 'sq ft', category: 'deck' }],
  [109, { name: 'Prestressed Concrete Open Girder/Beam', unit: 'ft', category: 'super' }],
  [310, { name: 'Elastomeric Bearing', unit: 'each', category: 'super' }],
] as const);
const elementByObjectId = new Map([
  ['o-beam', 109],
  ['o-deck', 12],
  ['o-brg', 310],
]);

describe('formContext: object to element, defect options and unit', () => {
  it('beam (109, super): only defects that apply to super, unit fixed to ft', () => {
    const c = formContext('o-beam', elementByObjectId, ELEMENTS, 'Superstructure');
    expect(c.element).toEqual({ no: 109, name: 'Prestressed Concrete Open Girder/Beam', unit: 'ft', category: 'super' });
    expect(c.category).toBe('super');
    expect(c.lockedUnit).toBe('ft');
    const nos = c.defects.map((d) => d.no);
    expect(nos).toContain(1110);
    expect(nos).not.toContain(1130); // Cracking (RC and Other) does not apply to super
    expect(nos).not.toContain(6000);
  });

  it('bearing (310): has the bearing defect (2230), unit each', () => {
    const c = formContext('o-brg', elementByObjectId, ELEMENTS, 'Superstructure');
    expect(c.defects.map((d) => d.no)).toContain(2230);
    expect(c.lockedUnit).toBe('each');
  });

  it('object without an element: filtered by component category (Superstructure to super), unit left to choose', () => {
    const c = formContext('o-xf', elementByObjectId, ELEMENTS, 'Superstructure');
    expect(c.element).toBeNull();
    expect(c.category).toBe('super');
    expect(c.lockedUnit).toBeNull();
    expect(c.defects.every((d) => d.appliesTo.includes('super'))).toBe(true);
  });

  it('all defects when the component category is unknown too', () => {
    const c = formContext('o-x', elementByObjectId, ELEMENTS, null);
    expect(c.category).toBeNull();
    expect(c.defects.length).toBe(26);
  });

  it('the four component categories map to element categories', () => {
    expect(formContext('o', new Map(), ELEMENTS, 'Deck').category).toBe('deck');
    expect(formContext('o', new Map(), ELEMENTS, 'Substructure').category).toBe('sub');
    expect(formContext('o', new Map(), ELEMENTS, 'Other').category).toBe('other');
  });
});

describe('buildAashtoDamage: validation and registerDamage input', () => {
  const target = { bridgeId: 'b1', objectId: 'o-beam', position: { x: 1, y: 2, z: 3 } };
  const ctx = formContext('o-beam', elementByObjectId, ELEMENTS, 'Superstructure');
  const ok: AashtoFormValues = { defectNo: 1080, cs: 3, quantity: 4, unit: null, notes: '  West face  ' };

  it('valid input: defect name goes to fault_type, the four AASHTO fields are set, size and grade fields stay empty, no round is passed (profile default)', () => {
    expect(buildAashtoDamage(ok, ctx, target)).toEqual({
      ok: true,
      input: {
        bridgeId: 'b1',
        objectId: 'o-beam',
        faultType: 'Delamination/Spall/Patched Area',
        position: { x: 1, y: 2, z: 3 },
        widthMm: null,
        lengthM: null,
        cnt: 1,
        quantity: null,
        grade: null,
        note: 'West face',
        defectNo: 1080,
        conditionState: 3,
        csQuantity: 4,
        csUnit: 'ft',
      },
    });
  });

  it('the unit is fixed to the element unit even when the form value differs', () => {
    const r = buildAashtoDamage({ ...ok, unit: 'sq ft' }, ctx, target);
    expect(r.ok && r.input.csUnit).toBe('ft');
  });

  it('returns an error text when defect, CS or quantity (> 0) is missing', () => {
    expect(buildAashtoDamage({ ...ok, defectNo: null }, ctx, target)).toEqual({ ok: false, error: SEval.form.errDefect });
    expect(buildAashtoDamage({ ...ok, defectNo: 6000 }, ctx, target)).toEqual({ ok: false, error: SEval.form.errDefect }); // a filtered-out defect
    expect(buildAashtoDamage({ ...ok, cs: null }, ctx, target)).toEqual({ ok: false, error: SEval.form.errCs });
    expect(buildAashtoDamage({ ...ok, quantity: '' }, ctx, target)).toEqual({ ok: false, error: SEval.form.errQuantity });
    expect(buildAashtoDamage({ ...ok, quantity: 0 }, ctx, target)).toEqual({ ok: false, error: SEval.form.errQuantity });
  });

  it('an object without an element needs a unit', () => {
    const noEl = formContext('o-xf', elementByObjectId, ELEMENTS, 'Superstructure');
    const t = { ...target, objectId: 'o-xf' };
    expect(buildAashtoDamage({ ...ok, defectNo: 1000 }, noEl, t)).toEqual({ ok: false, error: SEval.form.errUnit });
    const r = buildAashtoDamage({ ...ok, defectNo: 1000, unit: 'each' }, noEl, t);
    expect(r.ok && r.input.csUnit).toBe('each');
  });

  it('CS1 can be recorded too (a defect in CS1 stays as CS1 in the element condition totals)', () => {
    const r = buildAashtoDamage({ ...ok, cs: 1 }, ctx, target);
    expect(r.ok && r.input.conditionState).toBe(1);
  });
});

// ------------------------------------------------------------------
//  Quantity > element total of the object (object_elements.quantity; useObjectElements): a non-blocking warning.
//  Beam B2 (109) is 89.5 ft; more ft than that on one damage is usually a typing mistake.
// ------------------------------------------------------------------
describe('quantityWarning: a quantity above the element total of the object only warns (not blocking)', () => {
  const qtyByObject = new Map([
    ['o-beam', 89.5],
    ['o-deck', 2772],
  ]);
  const target = { bridgeId: 'b1', objectId: 'o-beam', position: { x: 1, y: 2, z: 3 } };
  const beam = formContext('o-beam', elementByObjectId, ELEMENTS, 'Superstructure', qtyByObject);
  const values: AashtoFormValues = { defectNo: 1080, cs: 3, quantity: 4, unit: null, notes: '' };

  it('formContext: element total of the object (elementTotal); null for an object without an element or an unknown quantity', () => {
    expect(beam.elementTotal).toBe(89.5);
    expect(formContext('o-xf', elementByObjectId, ELEMENTS, 'Superstructure', qtyByObject).elementTotal).toBeNull();
    expect(formContext('o-brg', elementByObjectId, ELEMENTS, 'Superstructure', qtyByObject).elementTotal).toBeNull();
    expect(formContext('o-beam', elementByObjectId, ELEMENTS, 'Superstructure').elementTotal).toBeNull();
  });

  it('gives a warning text above the total (total, element unit) and none when equal, below or empty', () => {
    expect(quantityWarning({ ...values, quantity: 100 }, beam)).toBe("Exceeds this element's total of 89.5 ft — check the quantity");
    expect(quantityWarning({ ...values, quantity: 100 }, beam)).toBe(SEval.form.warnOverTotal('89.5', 'ft'));
    expect(quantityWarning({ ...values, quantity: 89.5 }, beam)).toBeNull();
    expect(quantityWarning({ ...values, quantity: 4 }, beam)).toBeNull();
    expect(quantityWarning({ ...values, quantity: '' }, beam)).toBeNull();
  });

  it('formats the total like the on-screen quantities (thousands separator): deck 2,772 sq ft', () => {
    const deck = formContext('o-deck', elementByObjectId, ELEMENTS, 'Deck', qtyByObject);
    expect(quantityWarning({ ...values, defectNo: 1130, quantity: 3000 }, deck)).toBe(
      "Exceeds this element's total of 2,772 sq ft — check the quantity",
    );
  });

  it('does not warn when the total is unknown (object without an element, no object_elements row)', () => {
    expect(quantityWarning({ ...values, quantity: 1e6 }, formContext('o-xf', elementByObjectId, ELEMENTS, 'Superstructure', qtyByObject))).toBeNull();
    expect(quantityWarning({ ...values, quantity: 1e6 }, formContext('o-beam', elementByObjectId, ELEMENTS, 'Superstructure'))).toBeNull();
  });

  it('does not block: above the total the register input is unchanged (validation is quantity > 0 only)', () => {
    const r = buildAashtoDamage({ ...values, quantity: 100 }, beam, target);
    expect(r.ok).toBe(true);
    expect(r.ok && r.input.csQuantity).toBe(100);
    expect(buildAashtoDamage({ ...values, quantity: 0 }, beam, target)).toEqual({ ok: false, error: SEval.form.errQuantity });
  });
});
