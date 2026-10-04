// ------------------------------------------------------------------
//  3D model import: compresses the pipeline GLB and puts it where the app expects its assets.
//
//    node scripts/beechwood/add-model.mjs        (npm run pipeline:model)
//      source  <BEECHWOOD_PIPELINE_DIR | ../beechwood-pipeline>/model/out/BEECHWOOD.glb + objects.json
//            (if the GLB is missing, rebuild it in the pipeline repository with
//             python model/build_beechwood.py; the build is deterministic, so the same commit gives the same bytes)
//      target  public/models3d/beechwood/{BEECHWOOD.glb, manifest.json}   (committed)
//
//  Compression: dedup, prune, unpartition, meshopt (medium).
//  The output starts with the pipeline commit hash (pipeline.mjs). Exits 1 on failure.
// ------------------------------------------------------------------
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addModel, MODEL_DEST_REL, MODEL_SRC_REL } from './model.mjs';
import { pipelineBanner, pipelineDir } from './pipeline.mjs';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PIPE = pipelineDir();
const paths = {
  srcGlb: join(PIPE, MODEL_SRC_REL.glb),
  srcObjects: join(PIPE, MODEL_SRC_REL.objects),
  outDir: join(WEB, MODEL_DEST_REL),
};

try {
  const res = await addModel(paths);
  for (const line of pipelineBanner('add-model', PIPE, [MODEL_SRC_REL.objects])) console.log(line);
  console.log(`  (if in doubt about BEECHWOOD.glb, rebuild it with build_beechwood.py in the pipeline repository)`);
  console.log(`[add-model] ${paths.srcGlb}`);
  console.log(`  BEECHWOOD.glb: ${(res.srcBytes / 1024).toFixed(1)} KB (source) -> ${(res.outBytes / 1024).toFixed(1)} KB (meshopt medium)`);
  console.log(`  manifest.json: 1 group · ${res.objects} objects (the row count of objects.json)`);
  console.log(`  non-object meshes (not in the manifest): ${res.extraNodes.join(', ') || 'none'}`);
  console.log(`→ ${relative(WEB, paths.outDir).replaceAll('\\', '/')}/ (BEECHWOOD.glb · manifest.json)`);
} catch (e) {
  console.error(`[add-model] failed: ${e instanceof Error ? e.message : e}`);
  console.error('  If the pipeline repository is elsewhere, set BEECHWOOD_PIPELINE_DIR.');
  process.exit(1);
}
