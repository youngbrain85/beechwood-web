// ------------------------------------------------------------------
//  Fixture-mode photos: the fake storage (placeholder images instead of signed URLs), the photo rows
//  synthesized on top of the snapshot, and the real loader (hooks/useDamagePhotos) reading both.
// ------------------------------------------------------------------
import { describe, expect, it, vi } from 'vitest';
import { BROKEN_SUFFIX, createFakeClient, fixturePhotoUrl } from './fakeClient';
import { fixturePhotoRows, withFixturePhotos } from './fixturePhotos';
import { DAMAGE_PHOTOS_SELECT } from '@/lib/damagePhotos';

const SNAPSHOT = {
  inspections: [{ id: 'i1', bridge_id: 'b1', round_label: '2026-09', started_at: '2026-09-21T13:00:00+00:00' }],
  damages: [0, 1, 2, 3, 4].map((i) => ({
    id: `d${i}`,
    status: 'active',
    first_inspection_id: 'i1',
    photo_url: null,
    inspections: { round_label: '2026-09' },
  })),
};

// The loader below reads through this client (the same wiring as fixture mode: snapshot + synthesized rows).
vi.mock('@/lib/supabase', async () => {
  const { createFakeClient: make } = await import('./fakeClient');
  const { withFixturePhotos: add } = await import('./fixturePhotos');
  return { supabase: make(add(SNAPSHOT)) };
});

describe('fake storage', () => {
  it('gives a placeholder image (data URI) carrying the path instead of a signed URL, and records the request in signs', async () => {
    const sb = createFakeClient({});
    const many = await sb.storage.from('damage-photos').createSignedUrls(['d1/a.jpg', 'old_spall.jpg'], 3600);
    expect(many.error).toBeNull();
    expect(many.data.map((x) => [x.path, x.error])).toEqual([
      ['d1/a.jpg', null],
      ['old_spall.jpg', null],
    ]);
    expect(many.data.every((x) => x.signedUrl.startsWith('data:image/svg+xml'))).toBe(true);
    expect(decodeURIComponent(many.data[0]!.signedUrl)).toContain('d1/a.jpg');
    const one = await sb.storage.from('damage-photos').createSignedUrl('d1/a.jpg', 3600);
    expect(one).toEqual({ data: { signedUrl: many.data[0]!.signedUrl }, error: null });
    expect(sb.signs).toEqual([
      { bucket: 'damage-photos', paths: ['d1/a.jpg', 'old_spall.jpg'] },
      { bucket: 'damage-photos', paths: ['d1/a.jpg'] },
    ]);
  });

  it("gives an address that cannot be opened for a path ending in '-broken.jpg' (the broken image scene)", async () => {
    const sb = createFakeClient({});
    const r = await sb.storage.from('damage-photos').createSignedUrls([`d1/fx${BROKEN_SUFFIX}`, 'd1/a.jpg'], 3600);
    expect(r.data[0]!.signedUrl).not.toMatch(/^data:image\/svg/);
    expect(r.data[0]!.error).toBeNull();
    expect(r.data[1]!.signedUrl.startsWith('data:image/svg+xml')).toBe(true);
    const one = await sb.storage.from('damage-photos').createSignedUrl(`d1/fx${BROKEN_SUFFIX}`, 3600);
    expect(one.data.signedUrl).toBe(r.data[0]!.signedUrl);
  });

  it('escapes markup characters of the path in the placeholder', () => {
    expect(decodeURIComponent(fixturePhotoUrl('a<b>&"c.jpg'))).toContain('a&lt;b&gt;&amp;&quot;c.jpg');
  });
});

describe('fixturePhotoRows', () => {
  const rows = fixturePhotoRows(SNAPSHOT.damages);
  const of = (id: string) => rows.filter((r) => r.damage_id === id);

  it('follows the snapshot order of the damages: 2 photos, 3 photos + 1 deleted, none, and again', () => {
    expect(SNAPSHOT.damages.map((d) => of(d.id).map((r) => r.status))).toEqual([
      ['active', 'active'],
      ['active', 'active', 'active', 'deleted'],
      [],
      ['active', 'active'],
      ['active', 'active', 'active', 'deleted'],
    ]);
  });

  it('paths sit under the damage id; one photo of a 3-photo damage is the broken one', () => {
    expect(of('d0').map((r) => r.storage_path)).toEqual(['d0/fx-1.jpg', 'd0/fx-2.jpg']);
    expect(of('d1').map((r) => r.storage_path)).toEqual(['d1/fx-1.jpg', `d1/fx-2${BROKEN_SUFFIX}`, 'd1/fx-3.jpg', 'd1/fx-4.jpg']);
  });

  it('rows carry the round of the damage, unique ids and client ids, increasing times; a device file name on one photo only', () => {
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    expect(new Set(rows.map((r) => r.client_id)).size).toBe(rows.length);
    expect(rows.every((r) => r.inspection_id === 'i1')).toBe(true);
    const times = of('d1').map((r) => Date.parse(String(r.taken_at)));
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(of('d1').map((r) => r.device_filename)).toEqual(['fx_d1_1.jpg', null, null, null]);
    expect(of('d0').every((r) => r.device_filename === null)).toBe(true);
  });

  it('is deterministic (the same rows on every call)', () => {
    expect(fixturePhotoRows(SNAPSHOT.damages)).toEqual(rows);
  });
});

describe('withFixturePhotos', () => {
  it('adds damage_photos without touching the other tables or the input', () => {
    const out = withFixturePhotos(SNAPSHOT);
    expect(Object.keys(SNAPSHOT)).toEqual(['inspections', 'damages']);
    expect(out.damages).toBe(SNAPSHOT.damages);
    expect(out.inspections).toBe(SNAPSHOT.inspections);
    expect(out.damage_photos).toEqual(fixturePhotoRows(SNAPSHOT.damages));
  });

  it('keeps photo rows the snapshot already has', () => {
    const own = [{ id: 'p1', damage_id: 'd0', storage_path: 'd0/own.jpg' }];
    expect(withFixturePhotos({ ...SNAPSHOT, damage_photos: own }).damage_photos).toBe(own);
  });

  it('a snapshot without damages gets an empty photo table', () => {
    expect(withFixturePhotos({}).damage_photos).toEqual([]);
  });
});

describe('fake client: the photo query of the app', () => {
  it('resolves inspections(round_label) of a photo row through inspection_id', async () => {
    const sb = createFakeClient(withFixturePhotos(SNAPSHOT));
    const res = await sb.from('damage_photos').select(DAMAGE_PHOTOS_SELECT).eq('damage_id', 'd0').order('created_at', { ascending: true });
    expect(res.error).toBeNull();
    expect(res.data.map((r) => [r.storage_path, r.inspections])).toEqual([
      ['d0/fx-1.jpg', { round_label: '2026-09' }],
      ['d0/fx-2.jpg', { round_label: '2026-09' }],
    ]);
  });

  it('the real loader shows the active photos in order with placeholder images; the deleted one is left out', async () => {
    const { loadDamagePhotos } = await import('@/hooks/useDamagePhotos');
    const r = await loadDamagePhotos(SNAPSHOT.damages[1]!);
    expect(r.error).toBeNull();
    expect(r.photos.map((p) => [p.stored, p.roundLabel, p.deviceFilename, (p.url ?? '').slice(0, 18)])).toEqual([
      ['d1/fx-1.jpg', '2026-09', 'fx_d1_1.jpg', 'data:image/svg+xml'],
      [`d1/fx-2${BROKEN_SUFFIX}`, '2026-09', null, 'data:image/jpeg;ba'],
      ['d1/fx-3.jpg', '2026-09', null, 'data:image/svg+xml'],
    ]);
    const none = await loadDamagePhotos(SNAPSHOT.damages[2]!);
    expect(none).toEqual({ photos: [], error: null });
  });
});
