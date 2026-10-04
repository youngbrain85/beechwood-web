// ------------------------------------------------------------------
//  3D model import: the pipeline's model/out/{BEECHWOOD.glb, objects.json}
//  -> public/models3d/beechwood/{BEECHWOOD.glb, manifest.json}.
//  (CLI: scripts/beechwood/add-model.mjs; this file holds only the testable functions)
//
//  - Compression: dedup, prune, unpartition, meshopt (medium).
//    The app loader (src/lib/glb/loader.ts) already sets MeshoptDecoder.
//  - The manifest has the shape of the loader's Manifest type (loader.ts):
//    { version, units, frame, groups: [{ group, file, sizeKB, objects: [{ id, name, el, file }] }] }.
//    objects = objects.json rows (node name = id = database object_code). Ground meshes (BW_GROUND*) are not in objects.json
//    and so not in the manifest; they stay in the GLB and are drawn (not members, not selectable; src/bridge/beechwood/objects.ts).
//  - Everything is checked before writing: when the source is missing, objects.json is malformed, or an id of objects.json
//    is not a GLB node (a pair from different builds), it throws and the target folder is untouched.
// ------------------------------------------------------------------
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, unpartition } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/* Relative paths of the source (in the pipeline repository) and the target (in this repository) */
export const MODEL_SRC_REL = {
  glb: 'model/out/BEECHWOOD.glb',
  objects: 'model/out/objects.json',
};
export const MODEL_DEST_REL = 'public/models3d/beechwood';

/* Group name and file: one bridge in one GLB (as build_beechwood.GROUP/GLB_NAME of the pipeline) */
export const BW_GROUP = 'BEECHWOOD';
export const BW_GLB = 'BEECHWOOD.glb';
/* Coordinate frame note (the frame field of the manifest), from the pipeline's build_beechwood: z = (station - 106+21) ft, y = (EL - 400 ft) ft */
export const BW_FRAME = 'x=transverse(+right), y=(EL-400ft), z=(STA-106+21)';

/**
 * objects.json rows to the manifest (a single group).
 * @param {Array<{ id: string, name: string, el: string }>} objects
 * @param {number} sizeKB size of the compressed GLB (KB, rounded)
 */
export function manifestOf(objects, sizeKB) {
  return {
    version: 'v1',
    units: 'm',
    frame: BW_FRAME,
    groups: [
      {
        group: BW_GROUP,
        file: BW_GLB,
        sizeKB,
        objects: objects.map((o) => ({ id: o.id, name: o.name, el: o.el, file: BW_GLB })),
      },
    ],
  };
}

/* Reads objects.json and checks its shape (an array; id/name/el strings in every row) */
function readObjects(path) {
  if (!existsSync(path)) throw new Error(`objects.json not found: ${path}`);
  let rows;
  try {
    rows = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new Error(`objects.json is not JSON (${path}): ${e instanceof Error ? e.message : e}`);
  }
  if (!Array.isArray(rows)) throw new Error(`objects.json top level is not an array: ${path}`);
  const bad = rows.filter((r) => !r || ['id', 'name', 'el'].some((k) => typeof r[k] !== 'string' || !r[k]));
  if (bad.length) {
    throw new Error(`objects.json rows without id/name/el: ${bad.map((r) => r?.id ?? JSON.stringify(r)).join(', ')}`);
  }
  return rows;
}

/**
 * Compresses the GLB and writes the manifest.
 * @param {{ srcGlb: string, srcObjects: string, outDir: string }} paths
 * @returns {Promise<{ objects: number, extraNodes: string[], srcBytes: number, outBytes: number, sizeKB: number }>}
 */
export async function addModel({ srcGlb, srcObjects, outDir }) {
  if (!existsSync(srcGlb)) {
    throw new Error(
      `GLB not found: ${srcGlb}; build it first in the pipeline repository: python model/build_beechwood.py`,
    );
  }
  const objects = readObjects(srcObjects);

  await MeshoptEncoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  const doc = await io.read(srcGlb);

  // Pair check: every id of objects.json must be a GLB mesh node (outputs of the same build)
  const meshNodes = new Set(
    doc
      .getRoot()
      .listNodes()
      .filter((n) => n.getMesh())
      .map((n) => n.getName()),
  );
  const missing = objects.map((o) => o.id).filter((id) => !meshNodes.has(id));
  if (missing.length) {
    throw new Error(`ids of objects.json that are not GLB nodes (a pair from different builds?): ${missing.join(', ')}`);
  }
  const ids = new Set(objects.map((o) => o.id));
  const extraNodes = [...meshNodes].filter((n) => !ids.has(n)).sort();

  await doc.transform(dedup(), prune(), unpartition(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));

  mkdirSync(outDir, { recursive: true });
  const outGlb = join(outDir, BW_GLB);
  await io.write(outGlb, doc);
  const outBytes = statSync(outGlb).size;
  const sizeKB = Math.round(outBytes / 1024);
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifestOf(objects, sizeKB), null, 1) + '\n', 'utf8');

  return { objects: objects.length, extraNodes, srcBytes: statSync(srcGlb).size, outBytes, sizeKB };
}
