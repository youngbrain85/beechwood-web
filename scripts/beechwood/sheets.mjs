// ------------------------------------------------------------------
//  Sheet and proposal frame import: the pipeline's mangdo/ folder to
//    sheets/<file>.svg (the svg of sheets_index.json)   -> public/sheets-beechwood/<same file name>
//    frame_bw.svg · frame_bw_meta.json              -> public/proposal/
//  (CLI: scripts/beechwood/sync-sheets.mjs; this file holds only the testable functions)
//
//  - Sheet files keep **their original names** (01_BW-DECK-TOP-A.svg ...): the dashboard finds a sheet as
//    sheetsBase + basename(zone_spec.svg) (lib/siteUrl.sheetSvgUrl), and zone_spec.svg of the database and fixture is that
//    file name. Renaming to <sheet_id>.svg would make the dashboard miss them.
//  - The target sheet folder = the index (stale svg files are removed). An svg in the source folder that is not in the index is not copied (skipped).
//  - Only the two frame_bw files are written to public/proposal; other files in that folder are left alone.
//  - Everything is checked before writing: a bad index, source sheet or frame throws and the targets are untouched.
// ------------------------------------------------------------------
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

/* Relative paths of the source (in the pipeline repository) and the target (in this repository) */
export const SHEETS_SRC_REL = 'mangdo';
export const SHEETS_DEST_REL = 'public/sheets-beechwood';
export const PROPOSAL_DEST_REL = 'public/proposal';
/* Proposal preview frame (A3): the two files frames.templates.bw of the bridge profile points at */
export const FRAME_FILES = ['frame_bw.svg', 'frame_bw_meta.json'];

/* Last segment of a path (both / and \) */
const baseName = (p) => p.split(/[\\/]/).pop();

function readJson(path, what) {
  if (!existsSync(path)) throw new Error(`${what} not found: ${path}`);
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new Error(`${what} is not JSON (${path}): ${e instanceof Error ? e.message : e}`);
  }
}

/**
 * Imports the sheet SVGs and the proposal frame.
 * @param {{ mangdoDir: string, sheetsDest: string, proposalDest: string }} paths
 * @returns {{ copied: string[], removed: string[], skipped: string[], frames: string[], bytes: number }}
 */
export function syncSheets({ mangdoDir, sheetsDest, proposalDest }) {
  // ---- Checks (before writing) ----
  const index = readJson(join(mangdoDir, 'sheets_index.json'), 'sheets_index.json');
  const sheets = index?.sheets;
  if (!Array.isArray(sheets) || sheets.length === 0) {
    throw new Error(`sheets_index.json has no or an empty sheets array: ${join(mangdoDir, 'sheets_index.json')}`);
  }
  const noSvg = sheets.filter((s) => typeof s?.svg !== 'string' || !s.svg);
  if (noSvg.length) throw new Error(`sheets_index.json entries without svg: ${noSvg.map((s) => s?.sheet_id).join(', ')}`);

  const names = sheets.map((s) => baseName(s.svg));
  const dup = names.filter((n, i) => names.indexOf(n) !== i);
  if (dup.length) throw new Error(`sheets_index.json has the same sheet file name twice: ${[...new Set(dup)].join(', ')}`);

  const srcSheets = join(mangdoDir, 'sheets');
  const missing = names.filter((n) => !existsSync(join(srcSheets, n)));
  if (missing.length) throw new Error(`sheet SVGs of the index missing from the source folder (${srcSheets}): ${missing.join(', ')}`);

  const frameMissing = FRAME_FILES.filter((f) => !existsSync(join(mangdoDir, f)));
  if (frameMissing.length) throw new Error(`proposal frame files not found (${mangdoDir}): ${frameMissing.join(', ')}`);
  const meta = readJson(join(mangdoDir, 'frame_bw_meta.json'), 'frame_bw_meta.json');
  if (!meta || typeof meta.bw !== 'object' || meta.bw === null) {
    throw new Error(`frame_bw_meta.json has no bw entry (KEY PLAN coordinates): ${join(mangdoDir, 'frame_bw_meta.json')}`);
  }

  // ---- Write ----
  mkdirSync(sheetsDest, { recursive: true });
  let bytes = 0;
  for (const n of names) {
    copyFileSync(join(srcSheets, n), join(sheetsDest, n));
    bytes += readFileSync(join(sheetsDest, n)).length;
  }
  const keep = new Set(names);
  const removed = readdirSync(sheetsDest)
    .filter((f) => f.toLowerCase().endsWith('.svg') && !keep.has(f))
    .sort();
  for (const f of removed) rmSync(join(sheetsDest, f));
  const skipped = readdirSync(srcSheets)
    .filter((f) => f.toLowerCase().endsWith('.svg') && !keep.has(f))
    .sort();

  mkdirSync(proposalDest, { recursive: true });
  for (const f of FRAME_FILES) copyFileSync(join(mangdoDir, f), join(proposalDest, f));

  return { copied: names, removed, skipped, frames: [...FRAME_FILES], bytes };
}
