import { describe, expect, it } from 'vitest';
import { bridge } from '@/bridge';
import { naturalCompare, shouldFollowSuggestion, suggestTitle, uniqueTitle } from './title';
import { NO_CLIP } from './types';

const bounds = { min: [-7, 63, -3] as [number, number, number], max: [-3, 68, 3] as [number, number, number] };
const fmt = bridge.proposal.title;
const names = bridge.proposal.compositionNames;

describe('suggestTitle — the format of the bridge profile', () => {
  it('one object · a few · many', () => {
    expect(suggestTitle({ fine: 'Deck slab', codes: ['BW_DECK_B'], compositionName: names.four_side, clip: NO_CLIP, bounds }, fmt))
      .toBe('Deck slab (BW_DECK_B) — Four-Side Development');
    expect(suggestTitle({ fine: 'Beam', codes: ['BW_BEAM_B2', 'BW_BEAM_B1'], compositionName: names.three_view, clip: NO_CLIP, bounds }, fmt))
      .toBe('Beam (BW_BEAM_B1–BW_BEAM_B2) — Three-View');
    expect(suggestTitle({ fine: 'Beam', codes: ['A', 'B', 'C', 'D'], compositionName: names.single, clip: NO_CLIP, bounds }, fmt))
      .toBe('Beam (A + 3 more) — Single Main Face');
  });

  it('a narrowed range is appended', () => {
    expect(suggestTitle({ fine: 'Deck slab', codes: ['BW_DECK_B'], compositionName: names.development, clip: { x: null, y: null, z: [-13.716, 13.716] }, bounds }, fmt))
      .toBe('Deck slab (BW_DECK_B, STA 105+76.0–106+66.0) — Face-by-Face Development');
  });

  it('a taken title gets (2), (3)…', () => {
    expect(uniqueTitle('a', new Set(['a', 'a (2)']))).toBe('a (3)');
    expect(uniqueTitle('b', new Set(['a']))).toBe('b');
  });

  it('several narrowed axes come in z · y · x order, both ends written in full', () => {
    expect(suggestTitle({
      fine: 'Deck slab',
      codes: ['BW_DECK_B'],
      compositionName: names.three_view,
      clip: { x: [-3.048, 3.048], y: [4.572, 7.62], z: [-13.716, 13.716] },
      bounds,
    }, fmt)).toBe('Deck slab (BW_DECK_B, STA 105+76.0–106+66.0, EL 415.0–425.0 ft, x -10.0–10.0 ft) — Three-View');
  });

  it('object codes are sorted before they are shortened', () => {
    expect(suggestTitle({ fine: 'Beam', codes: ['D', 'B', 'A', 'C'], compositionName: names.single, clip: NO_CLIP, bounds }, fmt))
      .toBe('Beam (A + 3 more) — Single Main Face');
  });

  it('numbers inside codes compare as numbers — B9 comes before B10', () => {
    expect(suggestTitle({ fine: 'Beam', codes: ['BW_BEAM_B10', 'BW_BEAM_B9'], compositionName: names.three_view, clip: NO_CLIP, bounds }, fmt))
      .toBe('Beam (BW_BEAM_B9–BW_BEAM_B10) — Three-View');
    expect(suggestTitle({ fine: 'Beam', codes: ['BW_BEAM_B10', 'BW_BEAM_B2', 'BW_BEAM_B1'], compositionName: names.three_view, clip: NO_CLIP, bounds }, fmt))
      .toBe('Beam (BW_BEAM_B1–BW_BEAM_B10) — Three-View');
  });
});

describe('naturalCompare', () => {
  it('digit runs compare as numbers, with leading zeros or different lengths', () => {
    expect(naturalCompare('BW_XF_B::C05', 'BW_XF_B::C10')).toBeLessThan(0);
    expect(naturalCompare('A2', 'A10')).toBeLessThan(0);
    expect(naturalCompare('A10', 'A2')).toBeGreaterThan(0);
  });

  it('gives 0 for equal strings', () => {
    expect(naturalCompare('BW_BEAM_B10', 'BW_BEAM_B10')).toBe(0);
  });
});

// ------------------------------------------------------------------
//  Following the automatic suggestion: once the user edits the title the suggestion stops being followed, but
//  **when the title suggested by the engine changes** (another card, another selection) it must be followed again.
//  Otherwise the old title stays and the proposal is saved under the name of a different composition.
// ------------------------------------------------------------------
describe('shouldFollowSuggestion', () => {
  it('follows while the user has not edited', () => {
    expect(shouldFollowSuggestion({ suggested: 'A', lastSuggested: 'A', titleTouched: false })).toBe(true);
  });

  it('leaves the title alone when the user edited and the suggestion is unchanged', () => {
    expect(shouldFollowSuggestion({ suggested: 'A', lastSuggested: 'A', titleTouched: true })).toBe(false);
  });

  it('follows a new suggestion even after the user edited', () => {
    expect(shouldFollowSuggestion({ suggested: 'B', lastSuggested: 'A', titleTouched: true })).toBe(true);
  });

  it('follows on the first render too (no suggestion seen yet)', () => {
    expect(shouldFollowSuggestion({ suggested: '', lastSuggested: null, titleTouched: true })).toBe(true);
  });

  it('a suggestion that becomes empty because the candidates are gone also counts as "changed"', () => {
    expect(shouldFollowSuggestion({ suggested: '', lastSuggested: 'A', titleTouched: true })).toBe(true);
  });
});
