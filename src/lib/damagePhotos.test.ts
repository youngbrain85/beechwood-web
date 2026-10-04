// Damage photo display rules: the cases are pinned to the same expected values as the tablet app,
// so both show the same photos in the same order.
import { describe, expect, it } from 'vitest';
import {
  formatPhotoTime,
  photoSortKey,
  photoStoragePath,
  photosOfDamage,
  type DamagePhotoRow,
} from './damagePhotos';

const damage = (photoUrl: string | null, firstRound = '2026-03') => ({
  photo_url: photoUrl,
  inspections: { round_label: firstRound },
});
const photo = (id: string, path: string, round: string, at: string, status = 'active'): DamagePhotoRow => ({
  id,
  storage_path: path,
  status,
  taken_at: at,
  created_at: at,
  inspection_id: `i-${round}`,
  device_filename: null,
  inspections: { round_label: round },
});

describe('photosOfDamage', () => {
  it('keeps active rows only, oldest first, each with its round label', () => {
    const ps = photosOfDamage(damage(null), [
      photo('b', 'd1/b.jpg', '2026-09', '2026-10-01T00:00:00Z'),
      photo('x', 'd1/x.jpg', '2026-09', '2026-10-02T00:00:00Z', 'deleted'),
      photo('a', 'd1/a.jpg', '2026-03', '2026-04-01T00:00:00Z'),
    ]);
    expect(ps.map((p) => p.stored)).toEqual(['d1/a.jpg', 'd1/b.jpg']);
    expect(ps.map((p) => p.roundLabel)).toEqual(['2026-03', '2026-09']);
    expect(ps[0]!.legacy).toBe(false);
  });

  it('adds photo_url as one legacy photo (first round label) when no row holds it', () => {
    const ps = photosOfDamage(damage('old_damage_1.jpg'), []);
    expect(ps).toHaveLength(1);
    expect(ps[0]).toMatchObject({
      key: 'legacy:old_damage_1.jpg',
      id: null,
      stored: 'old_damage_1.jpg',
      path: 'old_damage_1.jpg',
      legacy: true,
      roundLabel: '2026-03',
    });
  });

  it('does not add photo_url again when a row (deleted ones included) already holds it', () => {
    const active = photosOfDamage(damage('d1/a.jpg'), [photo('a', 'd1/a.jpg', '2026-09', '2026-10-01T00:00:00Z')]);
    expect(active).toHaveLength(1);
    const deleted = photosOfDamage(damage('d1/a.jpg'), [
      photo('a', 'd1/a.jpg', '2026-09', '2026-10-01T00:00:00Z', 'deleted'),
    ]);
    expect(deleted).toEqual([]);
  });

  it('gives an empty list when there is no photo at all', () => {
    expect(photosOfDamage(damage('  '), [])).toEqual([]);
  });

  it('puts an undated legacy photo first, ignores rows with an empty path, treats a null status as active', () => {
    const ps = photosOfDamage(damage('legacy.jpg'), [
      { ...photo('n', 'd1/n.jpg', '2026-09', '2026-10-01T00:00:00Z'), status: null },
      photo('e', '   ', '2026-09', '2026-10-01T00:00:00Z'),
    ]);
    expect(ps.map((p) => p.stored)).toEqual(['legacy.jpg', 'd1/n.jpg']);
  });

  it('sorts by created_at when taken_at is missing', () => {
    const ps = photosOfDamage(damage(null), [
      { ...photo('late', 'd1/late.jpg', 'R', '2026-10-03T00:00:00Z'), taken_at: null },
      { ...photo('early', 'd1/early.jpg', 'R', '2026-10-02T00:00:00Z'), taken_at: null },
    ]);
    expect(ps.map((p) => p.id)).toEqual(['early', 'late']);
  });

  it('gives an empty round label when the round join is missing', () => {
    const ps = photosOfDamage({ photo_url: null, inspections: null }, [
      { ...photo('a', 'd1/a.jpg', 'R', '2026-10-01T00:00:00Z'), inspections: null },
    ]);
    expect(ps[0]!.roundLabel).toBe('');
  });

  it('carries the original file name of the tablet', () => {
    const ps = photosOfDamage(damage(null), [
      { ...photo('a', 'd1/a.jpg', 'R', '2026-10-01T00:00:00Z'), device_filename: '20261002_111851_BW-BEAM-B2_1080_99df30.jpg' },
    ]);
    expect(ps[0]!.deviceFilename).toBe('20261002_111851_BW-BEAM-B2_1080_99df30.jpg');
  });
});

describe('photoStoragePath', () => {
  it('keeps a path as is (trimmed)', () => {
    expect(photoStoragePath(' d1/a.jpg ')).toBe('d1/a.jpg');
  });
  it('decodes the path after the bucket of an old public URL', () => {
    expect(
      photoStoragePath('https://x.supabase.co/storage/v1/object/public/damage-photos/abc_span%20b.jpg'),
    ).toBe('abc_span b.jpg');
  });
  it('gives null for a URL of another bucket or shape and for an empty value', () => {
    expect(photoStoragePath('https://x.supabase.co/storage/v1/object/public/other/a.jpg')).toBeNull();
    expect(photoStoragePath('https://x.supabase.co/storage/v1/object/public/damage-photos/')).toBeNull();
    expect(photoStoragePath('https://x.supabase.co/storage/v1/object/public/damage-photos/%E0%A4%A')).toBeNull();
    expect(photoStoragePath('')).toBeNull();
    expect(photoStoragePath(null)).toBeNull();
  });
});

describe('photoSortKey and formatPhotoTime', () => {
  it('sort key: taken, then created, then 0', () => {
    expect(photoSortKey({ takenAt: '2026-01-01T00:00:00Z', createdAt: '2027-01-01T00:00:00Z' })).toBe(
      Date.parse('2026-01-01T00:00:00Z'),
    );
    expect(photoSortKey({ takenAt: null, createdAt: '2027-01-01T00:00:00Z' })).toBe(Date.parse('2027-01-01T00:00:00Z'));
    expect(photoSortKey({ takenAt: 'garbage', createdAt: null })).toBe(0);
  });
  it('display time: YYYY-MM-DD HH:mm (local); empty for an unreadable or missing value', () => {
    expect(formatPhotoTime('2026-10-02T02:18:51+00:00')).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    expect(formatPhotoTime('garbage')).toBe('');
    expect(formatPhotoTime(null)).toBe('');
  });
});
