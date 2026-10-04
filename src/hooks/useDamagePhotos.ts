// ------------------------------------------------------------------
//  Photos of one damage: the damage_photos query + signed URLs of the private bucket (read only).
//  Read only when a panel opens that damage (lazy, so the useDamages payload does not grow).
//  The display rules are in lib/damagePhotos (the same as the tablet app).
// ------------------------------------------------------------------
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  DAMAGE_PHOTOS_SELECT,
  PHOTO_BUCKET,
  SIGNED_URL_TTL_SEC,
  photosOfDamage,
  type DamagePhotoRow,
  type DamagePhotoSource,
  type DamagePhotoView,
} from '@/lib/damagePhotos';

/* One photo to draw; a null url shows as a broken image. */
export interface PhotoItem extends DamagePhotoView {
  url: string | null;
}

export interface DamagePhotosResult {
  photos: PhotoItem[];
  /* The photo table query failed. A missing table is not a failure (the one photo_url photo shows). */
  error: string | null;
}

/**
 * The response when the photo table (or its join) does not exist: the tablet's check plus the
 * message check of the web. In that case only photo_url is shown.
 */
export function isMissingPhotosTable(message: string): boolean {
  return (
    message.includes('PGRST205') ||
    message.includes('PGRST200') ||
    message.includes('42P01') ||
    message.includes('Could not find the table') ||
    message.includes('does not exist') ||
    message.includes('schema cache') ||
    message.includes('damage_photos')
  );
}

/* Signs the paths in one request; a path that failed is missing from the result (that photo gets url=null). */
async function signPaths(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (paths.length === 0) return out;
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, SIGNED_URL_TTL_SEC);
  if (error || !data) return out;
  for (const item of data) {
    if (item.path && item.signedUrl && !item.error) out.set(item.path, item.signedUrl);
  }
  return out;
}

/* Reads and signs the photos of one damage (outside React, so it can be tested). */
export async function loadDamagePhotos(damage: DamagePhotoSource & { id: string }): Promise<DamagePhotosResult> {
  let rows: DamagePhotoRow[] = [];
  let error: string | null = null;
  const res = await supabase
    .from('damage_photos')
    .select(DAMAGE_PHOTOS_SELECT)
    .eq('damage_id', damage.id)
    .order('created_at', { ascending: true });
  if (res.error) {
    const code = (res.error as { code?: string }).code ?? '';
    if (!isMissingPhotosTable(`${code} ${res.error.message}`)) error = res.error.message;
  } else {
    rows = (res.data ?? []) as unknown as DamagePhotoRow[];
  }
  const views = photosOfDamage(damage, rows);
  const paths = [...new Set(views.map((v) => v.path).filter((p): p is string => !!p))];
  let signed = new Map<string, string>();
  try {
    signed = await signPaths(paths);
  } catch {
    signed = new Map();
  }
  return {
    photos: views.map((v) => ({ ...v, url: v.path ? signed.get(v.path) ?? null : null })),
    error,
  };
}

/* Signs one photo again, once, when its image broke (expired and so on). Null on failure. */
export async function resignPhoto(path: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SEC);
    return error || !data ? null : data.signedUrl;
  } catch {
    return null;
  }
}

interface HookState extends DamagePhotosResult {
  loading: boolean;
}

/**
 * Photos of the open damage: read again only when the damage (id, photo_url, first round) changes. A late response of a previous damage is dropped.
 * retry(key): signs that photo once more when its image broke (each photo only once).
 */
export function useDamagePhotos(damage: (DamagePhotoSource & { id: string }) | null) {
  const [state, setState] = useState<HookState>({ photos: [], error: null, loading: false });
  const retried = useRef(new Set<string>());
  const damageId = damage?.id ?? null;
  const photoUrl = damage?.photo_url ?? null;
  const firstRound = damage?.inspections?.round_label ?? null;

  useEffect(() => {
    retried.current = new Set();
    if (!damageId) {
      setState({ photos: [], error: null, loading: false });
      return;
    }
    let alive = true;
    setState({ photos: [], error: null, loading: true });
    loadDamagePhotos({
      id: damageId,
      photo_url: photoUrl,
      inspections: firstRound == null ? null : { round_label: firstRound },
    }).then(
      (r) => {
        if (alive) setState({ ...r, loading: false });
      },
      (e: unknown) => {
        if (alive) setState({ photos: [], error: e instanceof Error ? e.message : String(e), loading: false });
      },
    );
    return () => {
      alive = false;
    };
  }, [damageId, photoUrl, firstRound]);

  const retry = useCallback(
    async (key: string): Promise<boolean> => {
      if (retried.current.has(key)) return false;
      retried.current.add(key);
      const target = state.photos.find((p) => p.key === key);
      if (!target?.path) return false;
      const url = await resignPhoto(target.path);
      if (!url) return false;
      setState((s) => ({ ...s, photos: s.photos.map((p) => (p.key === key ? { ...p, url } : p)) }));
      return true;
    },
    [state.photos],
  );

  return { ...state, retry };
}
