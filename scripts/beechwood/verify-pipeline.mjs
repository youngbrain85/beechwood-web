// ------------------------------------------------------------------
//  Imported files = pipeline originals (run explicitly): do the committed assets equal the originals in the pipeline repository.
//
//    node scripts/beechwood/verify-pipeline.mjs        (npm run pipeline:verify)
//      source  <BEECHWOOD_PIPELINE_DIR | ../beechwood-pipeline>/{mangdo/sheets, sheets_index.json,
//            frame_bw.svg, frame_bw_meta.json, model/out/objects.json}
//      target  public/{sheets-beechwood, proposal/frame_bw.*, models3d/beechwood/manifest.json}
//
//  Runs vitest with BEECHWOOD_PIPELINE_CHECK=1, which switches on the "imported files = pipeline originals" group of
//  src/bridge/beechwood/assets.test.ts. The default suite (npm test) skips that group so that the working tree of a
//  sibling repository cannot shake this repository's gate. Run it after an import (pipeline:model, :sheets) and before a release.
//  The output starts with the pipeline commit compared against. Exits 1 on a difference or a missing original.
// ------------------------------------------------------------------
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipelineBanner, pipelineDir } from './pipeline.mjs';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PIPE = pipelineDir();
for (const line of pipelineBanner('pipeline:verify', PIPE, [
  'mangdo/sheets',
  'mangdo/sheets_index.json',
  'mangdo/frame_bw.svg',
  'mangdo/frame_bw_meta.json',
  'model/out/objects.json',
])) {
  console.log(line);
}
const r = spawnSync('npx', ['vitest', 'run', 'src/bridge/beechwood/assets.test.ts'], {
  cwd: WEB,
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, BEECHWOOD_PIPELINE_CHECK: '1' },
});
process.exit(r.status ?? 1);
