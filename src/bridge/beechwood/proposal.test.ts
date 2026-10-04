// ------------------------------------------------------------------
//  Stored-value rules of sheet proposals: the title format (`Deck slab (BW_DECK_B, STA 105+76.0-106+66.0) ...`).
//  Stored values in the database are English, so no display-layer translation is involved.
//  The module is imported directly to check the format itself (the active profile path is in lib/proposal/title.test.ts).
// ------------------------------------------------------------------
import { describe, expect, it } from 'vitest';
import { suggestTitle } from '@/lib/proposal/title';
import { NO_CLIP, type Vec3 } from '@/lib/proposal/types';
import { beechwoodProposal } from './proposal';

const HANGUL = /[\uAC00-\uD7A3]/;
const bounds = { min: [-5, 0, -13.716] as Vec3, max: [5, 2, 13.716] as Vec3 };
const t = (codes: string[], clip = NO_CLIP, fine = 'Deck slab'): string =>
  suggestTitle(
    { fine, codes, compositionName: beechwoodProposal.compositionNames.development, clip, bounds },
    beechwoodProposal.title,
  );

describe('title format', () => {
  it('whole Span B: one space + parentheses after the fine member, en dash in the station range', () => {
    expect(t(['BW_DECK_B'], { x: null, y: null, z: [-13.716, 13.716] })).toBe(
      'Deck slab (BW_DECK_B, STA 105+76.0–106+66.0) — Face-by-Face Development',
    );
  });

  it('codes only when the range was not narrowed', () => {
    expect(t(['BW_DECK_B'])).toBe('Deck slab (BW_DECK_B) — Face-by-Face Development');
  });

  it('2-3 codes give first-last (natural order), 4 or more give `first + N more`', () => {
    expect(t(['BW_BEAM_B3', 'BW_BEAM_B1'], NO_CLIP, 'PSC bulb-tee beam')).toBe(
      'PSC bulb-tee beam (BW_BEAM_B1–BW_BEAM_B3) — Face-by-Face Development',
    );
    expect(t(['BW_BEAM_B4', 'BW_BEAM_B2', 'BW_BEAM_B1', 'BW_BEAM_B3'], NO_CLIP, 'PSC bulb-tee beam')).toBe(
      'PSC bulb-tee beam (BW_BEAM_B1 + 3 more) — Face-by-Face Development',
    );
  });

  it('no parentheses with neither codes nor a range', () => {
    expect(t([])).toBe('Deck slab — Face-by-Face Development');
  });

  it('several narrowed axes come in z, y, x order: elevation in ft, offset in ft', () => {
    expect(t(['BW_CAP_B2'], { x: [-1.524, 1.524], y: [3.048, 6.096], z: [-15.24, -12.192] }, 'Pier cap')).toBe(
      'Pier cap (BW_CAP_B2, STA 105+71.0–105+81.0, EL 410.0–420.0 ft, x -5.0–5.0 ft) — Face-by-Face Development',
    );
  });
});

describe('proposal rules: stored values', () => {
  it('the five composition names', () => {
    expect(beechwoodProposal.compositionNames).toEqual({
      single: 'Single Main Face',
      development: 'Face-by-Face Development',
      three_view: 'Three-View',
      four_side: 'Four-Side Development',
      cylinder: 'Cylinder Development (4 Quadrants)',
    });
  });

  it('bridge name and default fine member contain no Hangul', () => {
    expect(beechwoodProposal.storedName).toBe('Beechwood Rd over Little Blue River');
    expect(beechwoodProposal.fallbackFine).toBe('Other');
    const all = [
      beechwoodProposal.storedName,
      beechwoodProposal.fallbackFine,
      ...Object.values(beechwoodProposal.compositionNames),
      t(['BW_DECK_B', 'BW_DECK_A', 'BW_DECK_C', 'BW_RAIL_L'], { x: [-1, 1], y: [0, 1], z: [-1, 1] }),
    ];
    expect(all.filter((s) => HANGUL.test(s))).toEqual([]);
  });
});
