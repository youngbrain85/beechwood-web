// ------------------------------------------------------------------
//  Module that stands in for `@/lib/supabase` in fixture mode (conditional alias in vite.config.ts).
//
//  To start:  node scripts/dev-fx.mjs   (runs the vite dev server with VITE_FIXTURES=1)
//  Data:      node scripts/beechwood/sync-fixtures.mjs (.fixtures/beechwood.json, the pipeline seed snapshot; never commit it)
//            the dev server middleware serves it at /__fx/db.json (not a static import, so typecheck does not depend on it).
//  v_element_condition and v_nbi_components are not snapshot values: they are
//            computed from the session rows (src/dev/aashtoViews.ts, the same rules as schema.sql), so a registered damage shows at once.
//  damage_photos is synthesized on top of the snapshot (src/dev/fixturePhotos.ts) and the images are placeholders
//            from the fake storage, so the photo block can be looked at; the snapshot file is not changed.
//
//  NOTE: verification only. It opens the screens without signing in so text and layout can be compared, and shows the values a
//    damage registration would have sent to the database in window.__fxWrites (the stored-value contract). A production build has
//    no such alias, and should a build made in this mode exist, the deploy guard refuses it on the marker below.
// ------------------------------------------------------------------
import { AASHTO_VIEWS } from './aashtoViews';
import { createFakeClient, FIXTURE_MARKER } from './fakeClient';
import { withFixturePhotos } from './fixturePhotos';

const HOWTO = 'node scripts/beechwood/sync-fixtures.mjs';

export const supabase = createFakeClient(
  async () => {
    const res = await fetch('/__fx/db.json');
    if (!res.ok) throw new Error(`[${FIXTURE_MARKER}] no snapshot — run ${HOWTO} first`);
    return withFixturePhotos(await res.json());
  },
  { views: AASHTO_VIEWS },
);

declare global {
  interface Window {
    __fxWrites?: unknown[];
    __fxMode?: string;
  }
}
if (typeof window !== 'undefined') {
  window.__fxWrites = supabase.writes;
  window.__fxMode = FIXTURE_MARKER;
  console.info(`[${FIXTURE_MARKER}] fixture mode — nothing is written to the database (writes are recorded in window.__fxWrites)`);
}
