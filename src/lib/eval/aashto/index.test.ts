// Smoke test of the barrel re-exports. Code outside this folder imports the modules directly
// (tree-shaking), so within the folder this test is what actually uses index.ts.
import { describe, expect, it } from 'vitest';
import * as Aashto from './index';

describe('src/lib/eval/aashto barrel re-exports', () => {
  it('exports the element and defect reference tables', () => {
    expect(Aashto.ELEMENTS.length).toBe(12);
    expect(Aashto.DEFECTS.length).toBe(26);
  });

  it('exports the aggregation and rating pure functions', () => {
    expect(typeof Aashto.aggregate).toBe('function');
    expect(typeof Aashto.worstCsByObject).toBe('function');
    expect(typeof Aashto.elementRating).toBe('function');
    expect(typeof Aashto.componentRating).toBe('function');
    expect(typeof Aashto.overallCondition).toBe('function');
  });

  it('exports the COMPONENT_OF mapping', () => {
    expect(Aashto.COMPONENT_OF[12]).toBe('deck');
  });

  it('exports the display rules and the damage-to-observation conversion (the screens import through the barrel)', () => {
    expect(Aashto.csColour(3)).toBe('#EF6C00');
    expect(typeof Aashto.ratingBand).toBe('function');
    expect(typeof Aashto.defectsForCategory).toBe('function');
    expect(typeof Aashto.defectSymbol).toBe('function');
    expect(typeof Aashto.observationsOf).toBe('function');
    expect(typeof Aashto.latestObservation).toBe('function');
    expect(typeof Aashto.worstDefectsByElement).toBe('function');
  });
});
