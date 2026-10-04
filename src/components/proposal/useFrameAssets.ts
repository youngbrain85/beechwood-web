import { useEffect, useState } from 'react';
import { bridge } from '@/bridge';
import type { FrameKind, FrameMeta } from '@/lib/proposal/compose';
import { siteUrl } from '@/lib/siteUrl';

// ------------------------------------------------------------------
//  Sheet proposals: loader of frame templates and metrics.
//
//  A template (public/proposal/frame_*.svg) is a **static asset** of roughly 100 KB per kind.
//  There is no reason to fetch it again for every new set of candidates, so the module cache (Map)
//  holds the Promise itself and each kind is fetched once; several components asking for the same
//  kind at the same time still make one request.
//
//  Which file belongs to a kind is decided by the bridge profile (src/bridge, frames.templates).
// ------------------------------------------------------------------

export interface FrameAssets {
  template: string;
  meta: FrameMeta;
}

const CACHE = new Map<FrameKind, Promise<FrameAssets>>();

/* Frame kind to template and metrics URLs (profile templates + deploy base). null for a kind missing from the profile. */
export function frameUrls(kind: FrameKind): { svg: string; meta: string } | null {
  const t = Object.hasOwn(bridge.frames.templates, kind) ? bridge.frames.templates[kind] : undefined;
  return t ? { svg: siteUrl(t.svg), meta: siteUrl(t.meta) } : null;
}

async function fetchFrame(kind: FrameKind): Promise<FrameAssets> {
  const urls = frameUrls(kind);
  if (!urls) throw new Error(`frame_${kind}: no template`);
  const [svgRes, metaRes] = await Promise.all([fetch(urls.svg), fetch(urls.meta)]);
  if (!svgRes.ok) throw new Error(`frame_${kind} ${svgRes.status}`);
  if (!metaRes.ok) throw new Error(`frame_meta ${metaRes.status}`);
  return { template: await svgRes.text(), meta: (await metaRes.json()) as FrameMeta };
}

function loadFrame(kind: FrameKind): Promise<FrameAssets> {
  let hit = CACHE.get(kind);
  if (!hit) {
    hit = fetchFrame(kind);
    CACHE.set(kind, hit);
    // Failures are not cached: after a transient error the next selection fetches again.
    hit.catch(() => CACHE.delete(kind));
  }
  return hit;
}

export interface FrameAssetsState {
  frames: Partial<Record<FrameKind, FrameAssets>>;
  error: string | null;
}

/* Fetches only the kinds needed. Reruns only when the list changes (by contents, not array reference). */
export function useFrameAssets(kinds: FrameKind[]): FrameAssetsState {
  const [state, setState] = useState<FrameAssetsState>({ frames: {}, error: null });
  const key = [...new Set(kinds)].sort().join(',');

  useEffect(() => {
    if (!key) return;
    let alive = true;
    for (const kind of key.split(',') as FrameKind[]) {
      void loadFrame(kind).then(
        (assets) => {
          // Drop responses that arrive after unmount.
          if (alive) setState((s) => (s.frames[kind] ? s : { frames: { ...s.frames, [kind]: assets }, error: null }));
        },
        (err: unknown) => {
          if (alive) setState((s) => ({ ...s, error: err instanceof Error ? err.message : String(err) }));
        },
      );
    }
    return () => {
      alive = false;
    };
  }, [key]);

  return state;
}
