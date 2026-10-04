// sheets.mjs: unit tests of the sheet and proposal frame import.
// A fake pipeline mangdo folder is made in a temp folder; the real pipeline and public are untouched.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { syncSheets } from './sheets.mjs';

const META = { canvas_mm: [420, 297], main_area_mm: [10, 22, 304, 223], bw: { kp_box: [13, 248, 218, 44], padx: 18, z: [-38.4, 38.4], band_y: [265, 268] } };
const svg = (name) => `<svg xmlns="http://www.w3.org/2000/svg" data-sheet="${name}"/>`;

/**
 * Fake mangdo folder: sheets/<file>, sheets_index.json, frame_bw.svg, frame_bw_meta.json
 * @param {{ entries?: Array<{sheet_id: string, svg: string}>, files?: string[], index?: unknown, frame?: boolean, meta?: unknown }} o
 */
function setup(o = {}) {
  const entries = o.entries ?? [
    { sheet_id: 'BW-DECK-TOP-A', svg: '01_BW-DECK-TOP-A.svg' },
    { sheet_id: 'BW-BENT-2', svg: '16_BW-BENT-2.svg' },
  ];
  const root = mkdtempSync(join(tmpdir(), 'bw-sheets-'));
  const mangdoDir = join(root, 'pipeline/mangdo');
  mkdirSync(join(mangdoDir, 'sheets'), { recursive: true });
  for (const f of o.files ?? entries.map((e) => e.svg)) writeFileSync(join(mangdoDir, 'sheets', f), svg(f), 'utf8');
  writeFileSync(
    join(mangdoDir, 'sheets_index.json'),
    typeof o.index === 'string' ? o.index : JSON.stringify(o.index ?? { bridge: 'x', sheets: entries }),
    'utf8',
  );
  if (o.frame !== false) {
    writeFileSync(join(mangdoDir, 'frame_bw.svg'), svg('frame'), 'utf8');
    writeFileSync(join(mangdoDir, 'frame_bw_meta.json'), JSON.stringify(o.meta ?? META), 'utf8');
  }
  return {
    mangdoDir,
    sheetsDest: join(root, 'web/public/sheets-beechwood'),
    proposalDest: join(root, 'web/public/proposal'),
  };
}

describe('syncSheets: sheet SVGs keep their original file names (dashboard = sheetsBase + basename(zone_spec.svg))', () => {
  it('copies one file per sheet of the index: copy count = index length, contents byte for byte', () => {
    const p = setup();
    const res = syncSheets(p);
    expect(res.copied).toEqual(['01_BW-DECK-TOP-A.svg', '16_BW-BENT-2.svg']);
    expect(readdirSync(p.sheetsDest).sort()).toEqual(['01_BW-DECK-TOP-A.svg', '16_BW-BENT-2.svg']);
    expect(readFileSync(join(p.sheetsDest, '16_BW-BENT-2.svg'), 'utf8')).toBe(svg('16_BW-BENT-2.svg'));
  });

  it('every svg file name of the index is in the target folder after syncing (by file name even when the index svg carries a path)', () => {
    const entries = [
      { sheet_id: 'A', svg: '01_A.svg' },
      { sheet_id: 'B', svg: 'sheets/02_B.svg' },
      { sheet_id: 'C', svg: '03_C.svg' },
    ];
    const p = setup({ entries, files: ['01_A.svg', '02_B.svg', '03_C.svg'] });
    syncSheets(p);
    for (const e of entries) expect(existsSync(join(p.sheetsDest, e.svg.split('/').pop()))).toBe(true);
    expect(readdirSync(p.sheetsDest)).toHaveLength(entries.length);
  });

  it('removes stale sheets (svg files not in the index) from the target folder: folder = index', () => {
    const p = setup();
    mkdirSync(p.sheetsDest, { recursive: true });
    writeFileSync(join(p.sheetsDest, '99_BW-OLD.svg'), svg('old'), 'utf8');
    const res = syncSheets(p);
    expect(res.removed).toEqual(['99_BW-OLD.svg']);
    expect(readdirSync(p.sheetsDest).sort()).toEqual(['01_BW-DECK-TOP-A.svg', '16_BW-BENT-2.svg']);
  });

  it('an svg in the source folder but not in the index is not copied and is reported as skipped', () => {
    const p = setup({ files: ['01_BW-DECK-TOP-A.svg', '16_BW-BENT-2.svg', '00_scratch.svg'] });
    const res = syncSheets(p);
    expect(res.skipped).toEqual(['00_scratch.svg']);
    expect(existsSync(join(p.sheetsDest, '00_scratch.svg'))).toBe(false);
  });

  it('the proposal frame files frame_bw.svg and frame_bw_meta.json go to public/proposal, and other files in that folder are left alone', () => {
    const p = setup();
    mkdirSync(p.proposalDest, { recursive: true });
    writeFileSync(join(p.proposalDest, 'frame_other.svg'), 'other', 'utf8');
    const res = syncSheets(p);
    expect(res.frames).toEqual(['frame_bw.svg', 'frame_bw_meta.json']);
    expect(readFileSync(join(p.proposalDest, 'frame_bw.svg'), 'utf8')).toBe(svg('frame'));
    expect(JSON.parse(readFileSync(join(p.proposalDest, 'frame_bw_meta.json'), 'utf8'))).toEqual(META);
    expect(readFileSync(join(p.proposalDest, 'frame_other.svg'), 'utf8')).toBe('other');
  });
});

describe('syncSheets: checks before writing and throws on a problem (targets untouched)', () => {
  it('fails naming the file when an svg of the index is missing from the source folder', () => {
    const p = setup({ files: ['01_BW-DECK-TOP-A.svg'] });
    expect(() => syncSheets(p)).toThrow(/16_BW-BENT-2\.svg/);
    expect(existsSync(p.sheetsDest)).toBe(false);
    expect(existsSync(p.proposalDest)).toBe(false);
  });

  it('fails when the index file is missing, is not JSON, or has no or an empty sheets array', () => {
    const noJson = setup({ index: '{ nope' });
    expect(() => syncSheets(noJson)).toThrow(/sheets_index\.json/);
    const noArray = setup({ index: { bridge: 'x' } });
    expect(() => syncSheets(noArray)).toThrow(/sheets/);
    const empty = setup({ entries: [] });
    expect(() => syncSheets(empty)).toThrow(/sheets/);
    expect(existsSync(empty.sheetsDest)).toBe(false);
  });

  it('fails on an entry without svg or on the same file name twice', () => {
    const noSvg = setup({ entries: [{ sheet_id: 'BW-X' }], files: [] });
    expect(() => syncSheets(noSvg)).toThrow(/BW-X/);
    const dup = setup({
      entries: [
        { sheet_id: 'A', svg: '01_A.svg' },
        { sheet_id: 'B', svg: 'x/01_A.svg' },
      ],
      files: ['01_A.svg'],
    });
    expect(() => syncSheets(dup)).toThrow(/01_A\.svg/);
  });

  it('fails when a frame file is missing or frame_bw_meta.json has no bw entry', () => {
    const noFrame = setup({ frame: false });
    expect(() => syncSheets(noFrame)).toThrow(/frame_bw/);
    const noBw = setup({ meta: { canvas_mm: [420, 297] } });
    expect(() => syncSheets(noBw)).toThrow(/bw/);
    expect(existsSync(noBw.sheetsDest)).toBe(false);
  });
});
