// ------------------------------------------------------------------
//  Fixture import: brings the snapshot db/fixtures/db.json, made by the seed script of the pipeline
//  repository (beechwood-pipeline), to .fixtures/beechwood.json.
//  The AASHTO reference table of the same db folder (aashto_reference.json) is imported here too (syncReference, below).
//  (CLI: scripts/beechwood/sync-fixtures.mjs; this file holds only the testable functions)
//
//  - .fixtures/ is git-ignored; never commit the snapshot.
//  - The copy is byte for byte (no re-serialization). Before writing, the JSON and the required tables are checked and
//    a problem throws, so no empty or half-written file is left behind (an existing target file is untouched).
// ------------------------------------------------------------------
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

// The pipeline repository location is shared by the import scripts (pipeline.mjs); re-exported for existing users of this module.
export { pipelineDir } from './pipeline.mjs';

/* Relative paths of the source (in the pipeline repository) and the target (in this repository) */
export const FIXTURE_SRC_REL = 'db/fixtures/db.json';
export const FIXTURE_DEST_REL = '.fixtures/beechwood.json';

/**
 * Tables a snapshot must have: the 8 base tables (the same select and order as the app's queries)
 * + 5 AASHTO keys. The order equals DUMP_KEYS + EXTRA_KEYS of the pipeline's seed_beechwood.build_fixture.
 */
export const FIXTURE_KEYS = [
  'objects',
  'v_object_summary',
  'v_quantity_table',
  'damages',
  'members',
  'sheets',
  'bridge_sections',
  'inspections',
  'aashto_elements',
  'aashto_defects',
  'object_elements',
  'v_element_condition',
  'v_nbi_components',
];

/**
 * Copies src to dest (byte for byte) and returns the row count per table.
 * Throws when the source is missing, is not JSON, or lacks a required table or holds a non-array (the target is untouched).
 * @param {{ src: string, dest: string }} paths
 * @returns {{ counts: Record<string, number>, bytes: number }}
 */
export function syncFixtures({ src, dest }) {
  if (!existsSync(src)) throw new Error(`fixture source not found: ${src}`);
  const buf = readFileSync(src);

  let snap;
  try {
    snap = JSON.parse(buf.toString('utf8'));
  } catch (e) {
    throw new Error(`fixture is not JSON (${src}): ${e instanceof Error ? e.message : e}`);
  }
  if (!snap || typeof snap !== 'object' || Array.isArray(snap)) {
    throw new Error(`fixture top level is not an object: ${src}`);
  }
  const bad = FIXTURE_KEYS.filter((k) => !Array.isArray(snap[k]));
  if (bad.length) throw new Error(`fixture tables missing or not arrays: ${bad.join(', ')} (${src})`);

  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, buf);
  return { counts: Object.fromEntries(FIXTURE_KEYS.map((k) => [k, snap[k].length])), bytes: buf.length };
}

// ------------------------------------------------------------------
//  AASHTO reference import: the pipeline's db/aashto_reference.json (the reference the seed script loads into the
//  aashto_elements and aashto_defects tables) to src/lib/eval/aashto/reference.json (**committed**, unlike the fixture).
//  The app does not bundle this JSON: it uses the TS tables (ELEMENTS, DEFECTS), and reference.test.ts checks that number, name,
//  unit, category and applicable categories equal this copy (the CS descriptions are independent paraphrases and are not compared).
// ------------------------------------------------------------------
export const REFERENCE_SRC_REL = 'db/aashto_reference.json';
export const REFERENCE_DEST_REL = 'src/lib/eval/aashto/reference.json';

/**
 * Copies src to dest (byte for byte) and returns the element and defect counts.
 * Throws when the source is missing, is not JSON, or elements/defects are empty or not arrays (the target is untouched).
 * @param {{ src: string, dest: string }} paths
 * @returns {{ elements: number, defects: number, bytes: number }}
 */
export function syncReference({ src, dest }) {
  if (!existsSync(src)) throw new Error(`AASHTO reference source not found: ${src}`);
  const buf = readFileSync(src);
  let ref;
  try {
    ref = JSON.parse(buf.toString('utf8'));
  } catch (e) {
    throw new Error(`AASHTO reference is not JSON (${src}): ${e instanceof Error ? e.message : e}`);
  }
  const bad = ['elements', 'defects'].filter((k) => !Array.isArray(ref?.[k]) || ref[k].length === 0);
  if (bad.length) throw new Error(`AASHTO reference has no or empty ${bad.join(', ')} array: ${src}`);

  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, buf);
  return { elements: ref.elements.length, defects: ref.defects.length, bytes: buf.length };
}
