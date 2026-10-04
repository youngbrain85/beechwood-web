// ------------------------------------------------------------------
//  Sheet and proposal frame import.
//
//    node scripts/beechwood/sync-sheets.mjs        (npm run pipeline:sheets)
//      source  <BEECHWOOD_PIPELINE_DIR | ../beechwood-pipeline>/mangdo/
//            sheets/* sheets/*.svg (the svg of sheets_index.json), frame_bw.svg, frame_bw_meta.json
//      target  public/sheets-beechwood/<original file name>.svg, public/proposal/frame_bw.*
//            (committed)
//
//  Sheet files keep their original names (dashboard = sheetsBase + basename(zone_spec.svg)).
//  The output starts with the pipeline commit hash (pipeline.mjs). Exits 1 on failure.
// ------------------------------------------------------------------
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipelineBanner, pipelineDir } from './pipeline.mjs';
import { PROPOSAL_DEST_REL, SHEETS_DEST_REL, SHEETS_SRC_REL, syncSheets } from './sheets.mjs';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PIPE = pipelineDir();
const paths = {
  mangdoDir: join(PIPE, SHEETS_SRC_REL),
  sheetsDest: join(WEB, SHEETS_DEST_REL),
  proposalDest: join(WEB, PROPOSAL_DEST_REL),
};

try {
  const res = syncSheets(paths);
  const srcRel = [
    `${SHEETS_SRC_REL}/sheets`,
    `${SHEETS_SRC_REL}/sheets_index.json`,
    `${SHEETS_SRC_REL}/frame_bw.svg`,
    `${SHEETS_SRC_REL}/frame_bw_meta.json`,
  ];
  for (const line of pipelineBanner('sync-sheets', PIPE, srcRel)) console.log(line);
  console.log(`[sync-sheets] ${paths.mangdoDir}`);
  console.log(`  ${res.copied.length} sheets (= entries of sheets_index.json) · ${(res.bytes / 1024).toFixed(1)} KB`);
  console.log(`    ${res.copied[0]} … ${res.copied[res.copied.length - 1]}`);
  if (res.removed.length) console.log(`  stale sheets removed: ${res.removed.join(', ')}`);
  if (res.skipped.length) console.log(`  svg files not in the index, not copied: ${res.skipped.join(', ')}`);
  console.log(`  proposal frame: ${res.frames.join(' · ')}`);
  const rel = (p) => relative(WEB, p).replaceAll('\\', '/');
  console.log(`→ ${rel(paths.sheetsDest)}/ · ${rel(paths.proposalDest)}/`);
} catch (e) {
  console.error(`[sync-sheets] failed: ${e instanceof Error ? e.message : e}`);
  console.error('  If the pipeline repository is elsewhere, set BEECHWOOD_PIPELINE_DIR.');
  process.exit(1);
}
