// ------------------------------------------------------------------
//  Fixture and AASHTO reference import: copies two files of the pipeline db folder to their places in the app.
//
//    node scripts/beechwood/sync-fixtures.mjs        (npm run pipeline:fixtures)
//      (1) source  <BEECHWOOD_PIPELINE_DIR | ../beechwood-pipeline>/db/fixtures/db.json  (output of seed_beechwood.py)
//         target  .fixtures/beechwood.json   (verification only; git-ignored, never commit)
//      (2) source  .../db/aashto_reference.json   (element and defect reference)
//         target  src/lib/eval/aashto/reference.json  (committed; the parity reference of reference.test.ts)
//
//  After that `npm run dev:fixtures` (http://localhost:5203) serves (1) through the fake Supabase.
//  Exits 1 when a source is missing or malformed, never silently (each file is checked before its target is written:
//  if (1) is bad nothing is written, and if (2) is bad only (1) is refreshed).
//  The output starts with the pipeline commit hash (records which commit the seed and reference came from; pipeline.mjs).
// ------------------------------------------------------------------
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FIXTURE_DEST_REL,
  FIXTURE_SRC_REL,
  REFERENCE_DEST_REL,
  REFERENCE_SRC_REL,
  syncFixtures,
  syncReference,
} from './fixtures.mjs';
import { pipelineBanner, pipelineDir } from './pipeline.mjs';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PIPE = pipelineDir();
const src = join(PIPE, FIXTURE_SRC_REL);
const dest = join(WEB, FIXTURE_DEST_REL);
const refSrc = join(PIPE, REFERENCE_SRC_REL);
const refDest = join(WEB, REFERENCE_DEST_REL);
const rel = (p) => relative(WEB, p).replaceAll('\\', '/');

try {
  const { counts, bytes } = syncFixtures({ src, dest });
  const ref = syncReference({ src: refSrc, dest: refDest });
  for (const line of pipelineBanner('sync-fixtures', PIPE, [FIXTURE_SRC_REL, REFERENCE_SRC_REL])) console.log(line);
  console.log(`[sync-fixtures] ${src}`);
  for (const [table, n] of Object.entries(counts)) console.log(`  ${table.padEnd(20)} ${String(n).padStart(4)} rows`);
  console.log(`-> ${rel(dest)} (${(bytes / 1024).toFixed(1)} KB), never commit (.gitignore)`);
  console.log(`[sync-fixtures] ${refSrc}`);
  console.log(`  elements ${ref.elements} · defects ${ref.defects}`);
  console.log(`-> ${rel(refDest)} (${(ref.bytes / 1024).toFixed(1)} KB), committed (parity reference of reference.test.ts)`);
} catch (e) {
  console.error(`[sync-fixtures] failed: ${e instanceof Error ? e.message : e}`);
  console.error('  If the pipeline repository is elsewhere, set BEECHWOOD_PIPELINE_DIR.');
  process.exit(1);
}
