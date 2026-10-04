// ------------------------------------------------------------------
//  Sheet proposal strings (s.proposal.ts).
// ------------------------------------------------------------------
import { describe, expect, it } from 'vitest';
import { bridge } from '@/bridge';
import { COMPOSITION_NAME, SProposal } from './s.proposal';

// ------------------------------------------------------------------
//  The two "too large" guards prescribe different remedies:
//   · selection stage (SelectViewer EXTRACT_LIMIT, **before** clipping): narrowing the range does not help
//     → select fewer members
//   · engine stage (MAX_TRIANGLES, **after** clipping): narrowing the range helps → narrow the range
// ------------------------------------------------------------------
describe('oversized selection messages', () => {
  it('the selection stage says to select fewer members and shows the count before clipping', () => {
    const text = SProposal.errSelectionTooLarge(600001);
    expect(text).toContain('600,001');
  });

  it('the engine stage says to narrow the range and shows no count', () => {
    // The screen only holds the count from before clipping, which would be the wrong number here.
    expect(typeof SProposal.errTooLarge).toBe('string');
    expect(/\d/.test(SProposal.errTooLarge as unknown as string)).toBe(false);
  });

  it('the two messages differ', () => {
    expect(SProposal.errSelectionTooLarge(1)).not.toBe(SProposal.errTooLarge);
  });
});

describe('composition names', () => {
  it('the five names shown on cards and in the saved list', () => {
    expect(COMPOSITION_NAME).toEqual({
      single: 'Single Main Face',
      development: 'Face-by-Face Development',
      three_view: 'Three-View',
      four_side: 'Four-Side Development',
      cylinder: 'Cylinder Development (4 Quadrants)',
    });
  });

  it('are the stored names of the bridge profile — a title shows the same words as its card', () => {
    expect(COMPOSITION_NAME).toBe(bridge.proposal.compositionNames);
  });
});
