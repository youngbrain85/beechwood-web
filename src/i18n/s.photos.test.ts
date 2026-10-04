// Damage photo strings: the function-shaped strings give the right form.
// (Components are checked through screen captures; only the text is looked at here.)
import { describe, expect, it } from 'vitest';
import { SPhotos } from './s.photos';

describe('SPhotos', () => {
  it('count: singular and plural', () => {
    expect(SPhotos.count(1)).toBe('1 photo');
    expect(SPhotos.count(3)).toBe('3 photos');
  });

  it('open: the round is added in parentheses and left out when empty', () => {
    expect(SPhotos.open('2026-09')).toBe('Enlarge photo (2026-09)');
    expect(SPhotos.open('')).toBe('Enlarge photo');
  });

  it('position: "i / n"', () => {
    expect(SPhotos.position(2, 5)).toBe('2 / 5');
  });

  it('no string is empty', () => {
    for (const [k, v] of Object.entries(SPhotos)) {
      if (typeof v === 'string') expect(v, k).not.toBe('');
    }
  });
});
