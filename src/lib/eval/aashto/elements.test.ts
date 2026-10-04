// AASHTO element reference list as a TS table. This file checks the table's own values
// (count, duplicates, representative elements); the match with the pipeline reference (aashto_reference.json,
// copy ./reference.json) is checked by reference.test.ts (parity).
import { describe, expect, it } from 'vitest';
import { ELEMENTS } from './elements';

describe('ELEMENTS: AASHTO element reference list', () => {
  it('has the 12 entries of the list', () => {
    expect(ELEMENTS).toHaveLength(12);
  });

  it('has no duplicate no', () => {
    const nos = ELEMENTS.map((e) => e.no);
    expect(new Set(nos).size).toBe(nos.length);
  });

  it('No.12 reinforced concrete deck: sq ft, deck', () => {
    expect(ELEMENTS.find((e) => e.no === 12)).toEqual({
      no: 12,
      name: 'Reinforced Concrete Deck',
      unit: 'sq ft',
      category: 'deck',
    });
  });

  it('No.109 prestressed concrete girder/beam: ft, super', () => {
    expect(ELEMENTS.find((e) => e.no === 109)).toEqual({
      no: 109,
      name: 'Prestressed Concrete Open Girder/Beam',
      unit: 'ft',
      category: 'super',
    });
  });

  it('No.205 reinforced concrete column: each, sub', () => {
    expect(ELEMENTS.find((e) => e.no === 205)).toEqual({
      no: 205,
      name: 'Reinforced Concrete Column',
      unit: 'each',
      category: 'sub',
    });
  });

  it('No.310 elastomeric bearing: each, super (note that NBI counts it under super)', () => {
    expect(ELEMENTS.find((e) => e.no === 310)).toMatchObject({ unit: 'each', category: 'super' });
  });

  it('No.510 wearing surface: sq ft, deck', () => {
    expect(ELEMENTS.find((e) => e.no === 510)).toMatchObject({ unit: 'sq ft', category: 'deck' });
  });

  it('No.321/301/305/331 have category = other', () => {
    for (const no of [321, 301, 305, 331]) {
      expect(ELEMENTS.find((e) => e.no === no)?.category).toBe('other');
    }
  });

  it('unit is always one of sq ft/ft/each', () => {
    for (const e of ELEMENTS) {
      expect(['sq ft', 'ft', 'each']).toContain(e.unit);
    }
  });
});
