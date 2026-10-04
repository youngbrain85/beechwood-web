// ------------------------------------------------------------------
//  AASHTO reference table parity: the TS tables (ELEMENTS, DEFECTS) are compared with the copy of the pipeline reference
//  (reference.json, fetched from the pipeline's db/aashto_reference.json by npm run pipeline:fixtures) for
//  number, name, unit, category and applicable categories. The seed script loads that JSON into the database tables
//  aashto_elements and aashto_defects, so this guards the on-screen element names and defect options against drifting from the database.
//  The CS descriptions (cs2-cs4) are short paraphrases written independently on each side and are not compared.
//  reference.json is read by this test only; it is not part of the app bundle.
// ------------------------------------------------------------------
import { describe, expect, it } from 'vitest';
import { DEFECTS } from './defects';
import { ELEMENTS } from './elements';
import reference from './reference.json';
import type { ElementCategory } from './types';

describe('AASHTO reference parity: TS tables = pipeline aashto_reference.json', () => {
  it('elements: number, name, unit, category (including the number order)', () => {
    expect(ELEMENTS.map((e) => ({ element_no: e.no, name: e.name, unit: e.unit, category: e.category }))).toEqual(
      reference.elements,
    );
  });

  it('defects: number, name, applicable categories (including the number order), CS descriptions excluded', () => {
    expect(DEFECTS.map((d) => ({ defect_no: d.no, name: d.name, applies_to: d.appliesTo }))).toEqual(
      reference.defects.map(({ defect_no, name, applies_to }) => ({ defect_no, name, applies_to })),
    );
  });

  it('the categories are the four deck, super, sub, other, as in the reference', () => {
    const categories: ElementCategory[] = ['deck', 'super', 'sub', 'other'];
    expect(Object.keys(reference.categories)).toEqual(categories);
  });

  it('every defect of the reference has CS2-CS4 descriptions on the TS side (independent wording; only presence is checked)', () => {
    for (const d of reference.defects) {
      const ts = DEFECTS.find((x) => x.no === d.defect_no);
      expect([d.defect_no, ts?.cs[2], ts?.cs[3], ts?.cs[4]].every(Boolean)).toBe(true);
    }
  });
});
