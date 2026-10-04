// ------------------------------------------------------------------
//  Fields of the AASHTO damage form: element (fixed), defect select (filtered by element category), CS 1-4 radios, quantity + unit, notes.
//  (The filtered defect list, validation and stored values are in damageForm.test.ts. This file only checks what is shown.)
// ------------------------------------------------------------------
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MantineProvider } from '@mantine/core';
import { describe, expect, it } from 'vitest';
import { SEval } from '@/i18n/s.eval';
import { theme } from '@/theme';
import { AashtoDamageFormFields } from './AashtoDamageForm';
import { formContext, type AashtoFormValues } from './damageForm';
import type { AashtoElementInfo } from './rows';

function markup(el: ReactNode): string {
  return renderToStaticMarkup(
    createElement(MantineProvider, { theme, withCssVariables: false, withGlobalClasses: false }, el),
  ).replace(/></g, '>\n<');
}
/* Visible text (tags removed, HTML entities restored, whitespace normalized) */
const text = (html: string): string =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

const ELEMENTS: Map<number, AashtoElementInfo> = new Map([[109, { name: 'Prestressed Concrete Open Girder/Beam', unit: 'ft', category: 'super' }]] as const);
const EMPTY: AashtoFormValues = { defectNo: null, cs: null, quantity: '', unit: null, notes: '' };
const noop = (): void => {};

const fields = (objectId: string, values: AashtoFormValues = EMPTY): string =>
  markup(
    createElement(AashtoDamageFormFields, {
      ctx: formContext(objectId, new Map([['o-beam', 109]]), ELEMENTS, 'Superstructure'),
      values,
      onChange: noop,
    }),
  );

describe('AashtoDamageFormFields', () => {
  it('object with an element: element number, name and unit; the unit field is locked to the element unit', () => {
    const html = fields('o-beam');
    const t = text(html);
    expect(t).toContain('Element 109 Prestressed Concrete Open Girder/Beam');
    expect(t).toContain(SEval.form.unitLocked);
    expect(html).toMatch(/value="ft"[^>]*disabled|disabled[^>]*value="ft"/);
  });

  it('object without an element: a notice, and the unit can be chosen', () => {
    const html = fields('o-xf');
    expect(text(html)).toContain(SEval.form.noElement);
    expect(html).not.toMatch(/value="ft"[^>]*disabled/);
  });

  it('fields: Defect, Condition State (4 radios), Quantity, Unit, Notes', () => {
    const html = fields('o-beam');
    const t = text(html);
    for (const label of [SEval.defect, SEval.conditionState, SEval.quantity, SEval.unit, SEval.notes]) expect(t).toContain(label);
    expect(html.match(/type="radio"/g)).toHaveLength(4);
    for (const cs of ['CS1 · Good', 'CS2 · Fair', 'CS3 · Poor', 'CS4 · Severe']) expect(t).toContain(cs);
  });

  it('choosing a defect shows its state descriptions under the CS2-CS4 radios', () => {
    const t = text(fields('o-beam', { ...EMPTY, defectNo: 1080 }));
    expect(t).toContain('Minor spall or sound patch present; no exposed rebar');
    expect(t).toContain('Delamination/spalling has caused major section loss');
  });

  it('warns under the quantity field when the quantity exceeds the element total of the object (object_elements.quantity), and not otherwise', () => {
    const ctx = formContext('o-beam', new Map([['o-beam', 109]]), ELEMENTS, 'Superstructure', new Map([['o-beam', 89.5]]));
    const over = markup(createElement(AashtoDamageFormFields, { ctx, values: { ...EMPTY, quantity: 100 }, onChange: noop }));
    expect(text(over)).toContain("Exceeds this element's total of 89.5 ft — check the quantity");
    expect(over.match(/data-quantity-warning/g)).toHaveLength(1);
    const within = markup(createElement(AashtoDamageFormFields, { ctx, values: { ...EMPTY, quantity: 89.5 }, onChange: noop }));
    expect(within).not.toContain('data-quantity-warning');
    expect(text(within)).not.toContain('Exceeds');
  });
});
