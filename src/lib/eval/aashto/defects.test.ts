// AASHTO defect reference list: no/name/appliesTo match the pipeline's db/aashto_reference.json (copy
// ./reference.json); the full comparison is in reference.test.ts. The cs descriptions are not taken from that JSON:
// they are short paraphrases written separately (not copied verbatim, at most 120 characters).
import { describe, expect, it } from 'vitest';
import { DEFECTS } from './defects';

describe('DEFECTS: AASHTO defect reference list', () => {
  it('has the same 26 entries as the reference JSON (including 2340 Seal Cracking and metal defect 2370)', () => {
    expect(DEFECTS).toHaveLength(26);
  });

  it('has no duplicate no', () => {
    const nos = DEFECTS.map((d) => d.no);
    expect(new Set(nos).size).toBe(nos.length);
  });

  it('No.1000 corrosion and No.1020 connection apply to super only (not other)', () => {
    expect(DEFECTS.find((d) => d.no === 1000)?.appliesTo).toEqual(['super']);
    expect(DEFECTS.find((d) => d.no === 1020)?.appliesTo).toEqual(['super']);
  });

  it('No.1100 exposed prestressing applies to super only', () => {
    expect(DEFECTS.find((d) => d.no === 1100)?.appliesTo).toEqual(['super']);
  });

  it('No.1110 cracking (PSC) applies to super only', () => {
    expect(DEFECTS.find((d) => d.no === 1110)?.appliesTo).toEqual(['super']);
  });

  it('No.1130 cracking (RC and other) applies to deck/sub/other (not super)', () => {
    expect(DEFECTS.find((d) => d.no === 1130)?.appliesTo).toEqual(['deck', 'sub', 'other']);
  });

  it('No.2340 is Seal Cracking and metal deterioration or damage is No.2370; both apply to other only (expansion joints)', () => {
    expect(DEFECTS.find((d) => d.no === 2340)).toMatchObject({ name: 'Seal Cracking', appliesTo: ['other'] });
    expect(DEFECTS.find((d) => d.no === 2370)).toMatchObject({ name: 'Metal Deterioration or Damage', appliesTo: ['other'] });
  });

  it('No.3210/3220 wearing surface defects apply to deck only (for element 510)', () => {
    expect(DEFECTS.find((d) => d.no === 3210)?.appliesTo).toEqual(['deck']);
    expect(DEFECTS.find((d) => d.no === 3220)?.appliesTo).toEqual(['deck']);
  });

  it('No.4000 settlement applies to sub+other and No.6000 scour to sub only', () => {
    expect(DEFECTS.find((d) => d.no === 4000)?.appliesTo).toEqual(['sub', 'other']);
    expect(DEFECTS.find((d) => d.no === 6000)?.appliesTo).toEqual(['sub']);
  });

  it('No.7000 damage applies to all four categories', () => {
    expect(DEFECTS.find((d) => d.no === 7000)?.appliesTo).toEqual(['deck', 'super', 'sub', 'other']);
  });

  it('every appliesTo entry is one of the four categories', () => {
    const valid = new Set(['deck', 'super', 'sub', 'other']);
    for (const d of DEFECTS) {
      expect(d.appliesTo.length).toBeGreaterThan(0);
      for (const c of d.appliesTo) expect(valid.has(c)).toBe(true);
    }
  });

  it('cs has all three keys 2/3/4, each a non-empty sentence of at most 120 characters', () => {
    for (const d of DEFECTS) {
      for (const key of [2, 3, 4] as const) {
        const text = d.cs[key];
        expect(typeof text).toBe('string');
        expect(text.length).toBeGreaterThan(0);
        expect(text.length).toBeLessThanOrEqual(120);
      }
    }
  });

  it('cs descriptions differ from defect to defect (a sanity check against copy-paste)', () => {
    for (const d of DEFECTS) {
      const texts = [d.cs[2], d.cs[3], d.cs[4]];
      expect(new Set(texts).size).toBe(3);
    }
  });
});
