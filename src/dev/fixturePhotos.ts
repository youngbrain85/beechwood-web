// ------------------------------------------------------------------
//  Fixture-mode photo rows (verification only; never part of a production bundle).
//
//  The pipeline snapshot has no damage_photos rows (the seed registers none), so the rows are
//  synthesized here, on the web side, from the damages of the snapshot. The snapshot file itself is
//  not changed. The images come from the fake storage (fakeClient.ts fixturePhotoUrl), so the
//  thumbnails, the enlarged view and the broken image can be looked at without signing in.
//
//  Pattern by snapshot order of the damages (i = index):
//    i % 3 = 0   2 photos
//    i % 3 = 1   3 photos, the second one broken on purpose, + 1 photo marked deleted (must not show)
//    i % 3 = 2   no photo
//  The first photo of a 3-photo damage carries a device file name; every other one has none, which is
//  what a damage photographed from the web looks like.
// ------------------------------------------------------------------
import { BROKEN_SUFFIX } from './fakeClient';

type Row = Record<string, unknown>;

/* Time of the first synthesized photo; each later one is a minute after the previous. */
const BASE_TIME = Date.parse('2026-09-21T14:00:00Z');

/* Photo rows for the damages, in snapshot order. Deterministic: the same input gives the same rows. */
export function fixturePhotoRows(damages: readonly Row[]): Row[] {
  const out: Row[] = [];
  damages.forEach((d, i) => {
    const kind = i % 3;
    const active = kind === 0 ? 2 : kind === 1 ? 3 : 0;
    const total = kind === 1 ? active + 1 : active;
    for (let n = 1; n <= total; n++) {
      const broken = kind === 1 && n === 2;
      const at = new Date(BASE_TIME + (i * 10 + n) * 60_000).toISOString();
      out.push({
        id: `fxp-${i}-${n}`,
        damage_id: d.id,
        inspection_id: d.first_inspection_id ?? null,
        storage_path: `${String(d.id)}/fx-${n}${broken ? BROKEN_SUFFIX : '.jpg'}`,
        device_filename: kind === 1 && n === 1 ? `fx_${String(d.id)}_${n}.jpg` : null,
        client_id: `fxp-${String(d.id)}-${n}`,
        taken_at: at,
        status: n > active ? 'deleted' : 'active',
        created_at: at,
      });
    }
  });
  return out;
}

/* The snapshot with damage_photos added (rows the snapshot already has are kept). The input is not changed. */
export function withFixturePhotos<T extends Record<string, Row[]>>(tables: T): T & { damage_photos: Row[] } {
  return {
    ...tables,
    damage_photos: Array.isArray(tables.damage_photos) ? tables.damage_photos : fixturePhotoRows(tables.damages ?? []),
  };
}
