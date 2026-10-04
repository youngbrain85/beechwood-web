import { describe, expect, it } from 'vitest';
import { makeSegmentOf, meshMatchesSelection, meshSelectionKeys } from './memberTree';

describe('selection matching', () => {
  const segmentOf = makeSegmentOf(['BW_COL_d', 'BW_DECK_A', 'BW_RAIL', 'BW_XF']);
  it('segment = manifest id (exact match, then longest prefix, then group)', () => {
    expect(segmentOf('BW_COL_d', 'COL')).toBe('BW_COL_d');
    expect(segmentOf('BW_DECK_A_x', 'DECK')).toBe('BW_DECK_A');
    expect(segmentOf('Handrail', 'BW_RAIL')).toBe('BW_RAIL');
    expect(segmentOf('ZZZ', 'NOPE')).toBe('');
  });
  it('keys a mesh answers to — segment, object id, group', () => {
    expect(meshSelectionKeys({ objectId: 'BW_RAIL', group: 'BW_RAIL', objName: 'BW_RAIL::x' }, segmentOf))
      .toEqual(['BW_RAIL']);
    expect(meshSelectionKeys({ objectId: 'BW_DECK_A_x', group: 'DECK', objName: 'BW_DECK_A_x' }, segmentOf))
      .toEqual(['BW_DECK_A', 'BW_DECK_A_x', 'DECK']);
    expect(meshMatchesSelection(new Set(['BW_DECK_A']), ['BW_DECK_A', 'BW_DECK_A_x', 'DECK'])).toBe(true);
    expect(meshMatchesSelection(new Set(['BW_COL_d']), ['BW_DECK_A'])).toBe(false);
  });
});
