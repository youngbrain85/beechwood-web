// Photos of one damage, query and signing: pins the query chain, the signing requests and the fallback
// branches with a fake supabase (the loader only, without a DOM).
import { beforeEach, describe, expect, it, vi } from 'vitest';

// A vi.mock factory is hoisted; the state each test changes is made with vi.hoisted.
const h = vi.hoisted(() => ({
  rows: [] as unknown[],
  rowsError: null as null | { code?: string; message: string },
  signed: new Map<string, string>(),
  signError: null as null | { message: string },
  calls: [] as Array<{ kind: string; args: unknown[] }>,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from(table: string) {
      const q = {
        select(cols: string) {
          h.calls.push({ kind: 'select', args: [table, cols] });
          return q;
        },
        eq(col: string, val: unknown) {
          h.calls.push({ kind: 'eq', args: [col, val] });
          return q;
        },
        order(col: string, opts?: unknown) {
          h.calls.push({ kind: 'order', args: [col, opts] });
          return Promise.resolve(h.rowsError ? { data: null, error: h.rowsError } : { data: h.rows, error: null });
        },
      };
      return q;
    },
    storage: {
      from(bucket: string) {
        return {
          async createSignedUrls(paths: string[], ttl: number) {
            h.calls.push({ kind: 'signMany', args: [bucket, paths, ttl] });
            if (h.signError) return { data: null, error: h.signError };
            return {
              data: paths.map((p) => ({
                path: p,
                signedUrl: h.signed.get(p) ?? null,
                error: h.signed.has(p) ? null : 'Object not found',
              })),
              error: null,
            };
          },
          async createSignedUrl(path: string, ttl: number) {
            h.calls.push({ kind: 'signOne', args: [bucket, path, ttl] });
            const u = h.signed.get(path);
            return u ? { data: { signedUrl: u }, error: null } : { data: null, error: { message: 'Object not found' } };
          },
        };
      },
    },
  },
}));

import { isMissingPhotosTable, loadDamagePhotos, resignPhoto } from './useDamagePhotos';

const DMG = { id: 'd1', photo_url: null as string | null, inspections: { round_label: '2026-09' } };
const row = (id: string, path: string, at: string, status = 'active') => ({
  id,
  storage_path: path,
  status,
  taken_at: at,
  created_at: at,
  inspection_id: 'i1',
  device_filename: `${id}.jpg`,
  inspections: { round_label: '2026-09' },
});

beforeEach(() => {
  h.rows = [];
  h.rowsError = null;
  h.signed = new Map();
  h.signError = null;
  h.calls = [];
});

describe('loadDamagePhotos', () => {
  it('queries the rows of that damage only (deleted ones included) and signs the active photos in one request', async () => {
    h.rows = [
      row('b', 'd1/b.jpg', '2026-10-02T00:00:00Z'),
      row('a', 'd1/a.jpg', '2026-10-01T00:00:00Z'),
      row('x', 'd1/x.jpg', '2026-10-03T00:00:00Z', 'deleted'),
    ];
    h.signed = new Map([
      ['d1/a.jpg', 'https://signed/a'],
      ['d1/b.jpg', 'https://signed/b'],
    ]);
    const r = await loadDamagePhotos(DMG);
    expect(r.error).toBeNull();
    expect(r.photos.map((p) => [p.id, p.url, p.deviceFilename])).toEqual([
      ['a', 'https://signed/a', 'a.jpg'],
      ['b', 'https://signed/b', 'b.jpg'],
    ]);
    expect(h.calls).toEqual([
      {
        kind: 'select',
        args: ['damage_photos', 'id,storage_path,status,taken_at,created_at,inspection_id,device_filename,inspections(round_label)'],
      },
      { kind: 'eq', args: ['damage_id', 'd1'] },
      { kind: 'order', args: ['created_at', { ascending: true }] },
      { kind: 'signMany', args: ['damage-photos', ['d1/a.jpg', 'd1/b.jpg'], 3600] },
    ]);
  });

  it('a photo that failed to sign has url=null (broken image); the others are unaffected', async () => {
    h.rows = [row('a', 'd1/a.jpg', '2026-10-01T00:00:00Z'), row('b', 'd1/b.jpg', '2026-10-02T00:00:00Z')];
    h.signed = new Map([['d1/b.jpg', 'https://signed/b']]);
    const r = await loadDamagePhotos(DMG);
    expect(r.photos.map((p) => p.url)).toEqual([null, 'https://signed/b']);
  });

  it('still shows the list when the signing request itself fails (every url=null)', async () => {
    h.rows = [row('a', 'd1/a.jpg', '2026-10-01T00:00:00Z')];
    h.signError = { message: 'network' };
    const r = await loadDamagePhotos(DMG);
    expect(r.photos.map((p) => [p.id, p.url])).toEqual([['a', null]]);
    expect(r.error).toBeNull();
  });

  it('a missing photo table (PGRST205) is not an error: falls back to the one photo_url photo', async () => {
    h.rowsError = { code: 'PGRST205', message: "Could not find the table 'public.damage_photos' in the schema cache" };
    h.signed = new Map([['legacy_old.jpg', 'https://signed/legacy']]);
    const r = await loadDamagePhotos({ ...DMG, photo_url: 'legacy_old.jpg' });
    expect(r.error).toBeNull();
    expect(r.photos.map((p) => [p.legacy, p.url, p.roundLabel])).toEqual([[true, 'https://signed/legacy', '2026-09']]);
  });

  it('reports any other query error in error while the photo_url photo still shows', async () => {
    h.rowsError = { message: 'JWT expired' };
    h.signed = new Map([['legacy_old.jpg', 'https://signed/legacy']]);
    const r = await loadDamagePhotos({ ...DMG, photo_url: 'legacy_old.jpg' });
    expect(r.error).toBe('JWT expired');
    expect(r.photos).toHaveLength(1);
  });

  it('sends no signing request when there is no photo', async () => {
    const r = await loadDamagePhotos(DMG);
    expect(r.photos).toEqual([]);
    expect(h.calls.some((c) => c.kind === 'signMany')).toBe(false);
  });

  it('does not sign an unreadable stored value (URL of another bucket); it shows as a broken image', async () => {
    const r = await loadDamagePhotos({ ...DMG, photo_url: 'https://x/storage/v1/object/public/other/a.jpg' });
    expect(r.photos.map((p) => [p.path, p.url])).toEqual([[null, null]]);
    expect(h.calls.some((c) => c.kind === 'signMany')).toBe(false);
  });

  it('turns an old public URL into a path and signs it', async () => {
    h.signed = new Map([['abc_a.jpg', 'https://signed/abc']]);
    const r = await loadDamagePhotos({
      ...DMG,
      photo_url: 'https://x.supabase.co/storage/v1/object/public/damage-photos/abc_a.jpg',
    });
    expect(r.photos[0]!.url).toBe('https://signed/abc');
  });
});

describe('resignPhoto', () => {
  it('gives the new URL on success and null on failure', async () => {
    h.signed = new Map([['d1/a.jpg', 'https://signed/a2']]);
    expect(await resignPhoto('d1/a.jpg')).toBe('https://signed/a2');
    expect(await resignPhoto('d1/none.jpg')).toBeNull();
    expect(h.calls.filter((c) => c.kind === 'signOne').map((c) => c.args)).toEqual([
      ['damage-photos', 'd1/a.jpg', 3600],
      ['damage-photos', 'd1/none.jpg', 3600],
    ]);
  });
});

describe('isMissingPhotosTable', () => {
  it.each([
    ["PGRST205 Could not find the table 'public.damage_photos' in the schema cache"],
    ['42P01 relation "public.damage_photos" does not exist'],
    ["PGRST200 Could not find a relationship between 'damage_photos' and 'inspections'"],
  ])('%s -> missing table', (m) => expect(isMissingPhotosTable(m)).toBe(true));
  it('network and auth errors are not a missing table', () => {
    expect(isMissingPhotosTable(' JWT expired')).toBe(false);
    expect(isMissingPhotosTable(' Failed to fetch')).toBe(false);
  });
});
