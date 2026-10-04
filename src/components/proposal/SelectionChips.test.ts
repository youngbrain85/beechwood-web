// ------------------------------------------------------------------
//  Selection chips: when there are many, only the first few show and the rest fold into a count.
//  There is no renderer to mount the screen, but the folding rule is a pure function and is tested as is.
// ------------------------------------------------------------------
import { describe, expect, it } from 'vitest';
import { CHIP_LIMIT, chipsToShow } from './SelectionChips';
import { SProposal } from '@/i18n/s.proposal';

const codes = (n: number): string[] => Array.from({ length: n }, (_, i) => `BW_BEAM_${i + 1}`);

describe('chipsToShow', () => {
  it('gives an empty list for nothing', () => {
    expect(chipsToShow([])).toEqual({ shown: [], more: 0 });
  });

  it('shows all up to the limit', () => {
    expect(chipsToShow(codes(CHIP_LIMIT))).toEqual({ shown: codes(CHIP_LIMIT), more: 0 });
  });

  it('one over the limit gives the first 12 + 1 folded', () => {
    const got = chipsToShow(codes(CHIP_LIMIT + 1));
    expect(got.shown).toEqual(codes(CHIP_LIMIT));
    expect(got.more).toBe(1);
  });

  it('shows at most the limit however many there are, the rest as a count', () => {
    const got = chipsToShow(codes(100));
    expect([got.shown.length, got.more]).toEqual([CHIP_LIMIT, 100 - CHIP_LIMIT]);
    // Shown plus folded equals the original count, which pins down that the +N on the chip is "the rest".
    expect(got.shown.length + got.more).toBe(100);
  });

  it('keeps the given order of the visible chips; natural sorting is up to the caller', () => {
    expect(chipsToShow(['B', 'A', 'C']).shown).toEqual(['B', 'A', 'C']);
  });

  it('the limit is 12', () => {
    expect(CHIP_LIMIT).toBe(12);
  });
});

describe('chip text', () => {
  it('the aria-label of the x says which code it removes', () => {
    expect(SProposal.removeSelection('BW_BEAM_10')).toContain('BW_BEAM_10');
  });

  it('the folded chip description carries the count', () => {
    expect(SProposal.moreSelected(7)).toContain('7');
  });
});
