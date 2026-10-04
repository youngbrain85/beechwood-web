// ------------------------------------------------------------------
//  Damage photo display rules: the same rules as the tablet app, so the web and the tablet show
//  the same photos in the same order. Change them in both places together.
//  The table is damage_photos (db/schema.sql of the pipeline repository).
// ------------------------------------------------------------------

/* Private storage bucket (the same as the tablet app). */
export const PHOTO_BUCKET = 'damage-photos';

/* Lifetime of a signed URL in seconds: one hour, as on the tablet. */
export const SIGNED_URL_TTL_SEC = 3600;

/* Columns queried from damage_photos, with device_filename (the original file name shown in the enlarged view). */
export const DAMAGE_PHOTOS_SELECT =
  'id,storage_path,status,taken_at,created_at,inspection_id,device_filename,inspections(round_label)';

/* One damage_photos row (query result). */
export interface DamagePhotoRow {
  id: string;
  storage_path: string | null;
  status: string | null;
  taken_at: string | null;
  created_at: string | null;
  inspection_id?: string | null;
  device_filename?: string | null;
  inspections?: { round_label: string | null } | null;
}

/* The damage fields photosOfDamage reads: a part of DamageWithDetails. */
export interface DamagePhotoSource {
  photo_url: string | null;
  inspections: { round_label: string | null } | null;
}

/* One photo to show: a damage_photos row, or a legacy photo that exists in photo_url only. */
export interface DamagePhotoView {
  /* React key: the row id; 'legacy:<stored value>' for a legacy photo. */
  key: string;
  /* damage_photos.id; null for a legacy photo. */
  id: string | null;
  /* The stored value as is (a bucket path or an old public URL). */
  stored: string;
  /* Bucket path to sign; null when it cannot be resolved (shown as a broken image). */
  path: string | null;
  /* Round the photo was taken in (inspections.round_label); '' when unknown. */
  roundLabel: string;
  takenAt: string | null;
  createdAt: string | null;
  /* Original file name in the tablet gallery, the key for pairing with the original. Null for a legacy photo. */
  deviceFilename: string | null;
  legacy: boolean;
}

/**
 * Stored photo value to the path inside the bucket.
 * A path stays as is; an old public URL gives the decoded part after '/storage/v1/object/public/damage-photos/'; anything else is null.
 */
export function photoStoragePath(stored: string | null | undefined): string | null {
  const s = (stored ?? '').trim();
  if (!s) return null;
  if (!s.startsWith('http')) return s;
  const marker = `/storage/v1/object/public/${PHOTO_BUCKET}/`;
  const i = s.indexOf(marker);
  if (i < 0) return null;
  const raw = s.slice(i + marker.length);
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

function timeOf(s: string | null | undefined): number | null {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}

/* Sort key: the time taken, else the time created, else 0 (the oldest). */
export function photoSortKey(p: Pick<DamagePhotoView, 'takenAt' | 'createdAt'>): number {
  return timeOf(p.takenAt) ?? timeOf(p.createdAt) ?? 0;
}

/**
 * The photos of one damage to show (active only, oldest first).
 * rows are **all** damage_photos rows of that damage (deleted ones included).
 *  - Only rows whose status is 'active' (null counts as active) and whose path is not blank are shown.
 *  - photo_url is added as one legacy photo (round = first round) when no row (deleted ones included) holds its path.
 *    A photo_url equal to the path of a deleted photo is not brought back.
 */
export function photosOfDamage(damage: DamagePhotoSource, rows: readonly DamagePhotoRow[]): DamagePhotoView[] {
  const out: DamagePhotoView[] = [];
  const known = new Set<string>();
  for (const r of rows) {
    const stored = (r.storage_path ?? '').trim();
    if (!stored) continue;
    known.add(stored);
    if ((r.status ?? 'active') !== 'active') continue;
    out.push({
      key: r.id,
      id: r.id,
      stored,
      path: photoStoragePath(stored),
      roundLabel: r.inspections?.round_label ?? '',
      takenAt: r.taken_at ?? null,
      createdAt: r.created_at ?? null,
      deviceFilename: r.device_filename ?? null,
      legacy: false,
    });
  }
  const legacy = (damage.photo_url ?? '').trim();
  if (legacy && !known.has(legacy)) {
    out.push({
      key: `legacy:${legacy}`,
      id: null,
      stored: legacy,
      path: photoStoragePath(legacy),
      roundLabel: damage.inspections?.round_label ?? '',
      takenAt: null,
      createdAt: null,
      deviceFilename: null,
      legacy: true,
    });
  }
  return out
    .map((p, i) => ({ p, i, k: photoSortKey(p) }))
    .sort((a, b) => a.k - b.k || a.i - b.i)
    .map((x) => x.p);
}

/* Time shown in the enlarged view: 'YYYY-MM-DD HH:mm' (browser local time); '' when it cannot be read. */
export function formatPhotoTime(iso: string | null | undefined): string {
  const t = timeOf(iso);
  if (t == null) return '';
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
