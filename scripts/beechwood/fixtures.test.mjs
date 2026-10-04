// fixtures.mjs: unit tests of the fixture import (pipeline db.json to .fixtures/beechwood.json).
// A fake source is made in a temp folder; the real pipeline repository and the real .fixtures are untouched.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { FIXTURE_KEYS, pipelineDir, syncFixtures, syncReference } from './fixtures.mjs';

/* A fake snapshot with all 13 keys; each table has a different row count (i+1 rows) to check the reported counts */
function fakeSnapshot() {
  return Object.fromEntries(FIXTURE_KEYS.map((k, i) => [k, Array.from({ length: i + 1 }, (_, j) => ({ id: j }))]));
}

function tempDirs() {
  const root = mkdtempSync(join(tmpdir(), 'bw-fixtures-'));
  const src = join(root, 'pipeline/db/fixtures/db.json');
  const dest = join(root, 'web/.fixtures/beechwood.json');
  mkdirSync(dirname(src), { recursive: true });
  return { src, dest };
}

describe('FIXTURE_KEYS', () => {
  it('the 8 base tables + 5 AASHTO keys (the order of seed_beechwood.build_fixture)', () => {
    expect(FIXTURE_KEYS).toEqual([
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
    ]);
  });
});

describe('syncFixtures', () => {
  it('copies the source byte for byte (creating the target folder) and returns the row count per table', () => {
    const { src, dest } = tempDirs();
    const text = JSON.stringify(fakeSnapshot(), null, 1) + '\n';
    writeFileSync(src, text, 'utf8');

    const res = syncFixtures({ src, dest });

    expect(readFileSync(dest, 'utf8')).toBe(text);
    expect(res.bytes).toBe(Buffer.byteLength(text));
    expect(res.counts).toEqual(Object.fromEntries(FIXTURE_KEYS.map((k, i) => [k, i + 1])));
  });

  it('fails naming the path when the source is missing, and creates no target', () => {
    const { src, dest } = tempDirs();
    expect(() => syncFixtures({ src, dest })).toThrow(src);
    expect(existsSync(dest)).toBe(false);
  });

  it('fails when it is not JSON, leaving an existing target file as it is', () => {
    const { src, dest } = tempDirs();
    writeFileSync(src, '{ not json', 'utf8');
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, 'previous', 'utf8');
    expect(() => syncFixtures({ src, dest })).toThrow(/JSON/);
    expect(readFileSync(dest, 'utf8')).toBe('previous');
  });

  it('fails naming the key when a required table is missing or not an array', () => {
    const { src, dest } = tempDirs();
    const snap = fakeSnapshot();
    delete snap.v_nbi_components;
    snap.object_elements = { not: 'an array' };
    writeFileSync(src, JSON.stringify(snap), 'utf8');
    expect(() => syncFixtures({ src, dest })).toThrow(/v_nbi_components/);
    expect(() => syncFixtures({ src, dest })).toThrow(/object_elements/);
    expect(existsSync(dest)).toBe(false);
  });
});

describe('pipelineDir', () => {
  const saved = process.env.BEECHWOOD_PIPELINE_DIR;
  afterEach(() => {
    if (saved === undefined) delete process.env.BEECHWOOD_PIPELINE_DIR;
    else process.env.BEECHWOOD_PIPELINE_DIR = saved;
  });

  it('defaults to the sibling folder beechwood-pipeline of this repository', () => {
    delete process.env.BEECHWOOD_PIPELINE_DIR;
    const dir = pipelineDir();
    expect(basename(dir)).toBe('beechwood-pipeline');
    // This file: <parent>/<web repository>/scripts/beechwood/; the pipeline is <parent>/beechwood-pipeline
    const webRepo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
    expect(dirname(dir)).toBe(dirname(webRepo));
  });

  it('can be changed with BEECHWOOD_PIPELINE_DIR', () => {
    process.env.BEECHWOOD_PIPELINE_DIR = join(tmpdir(), 'elsewhere', 'beechwood-pipeline');
    expect(pipelineDir()).toBe(join(tmpdir(), 'elsewhere', 'beechwood-pipeline'));
  });
});

// ------------------------------------------------------------------
//  AASHTO reference import: the pipeline's db/aashto_reference.json to src/lib/eval/aashto/reference.json (committed).
//  Parity with the TS tables (ELEMENTS, DEFECTS) is checked by src/lib/eval/aashto/reference.test.ts.
// ------------------------------------------------------------------
function referenceDirs() {
  const root = mkdtempSync(join(tmpdir(), 'bw-reference-'));
  const src = join(root, 'pipeline/db/aashto_reference.json');
  const dest = join(root, 'web/src/lib/eval/aashto/reference.json');
  mkdirSync(dirname(src), { recursive: true });
  return { src, dest };
}
const REF = {
  source: 'MBEI 2019',
  categories: { deck: 'Deck', super: 'Superstructure', sub: 'Substructure', other: 'Not rated' },
  elements: [{ element_no: 12, name: 'Reinforced Concrete Deck', unit: 'sq ft', category: 'deck' }],
  defects: [
    { defect_no: 1080, name: 'Delamination/Spall/Patched Area', applies_to: ['deck'], cs2: 'a', cs3: 'b', cs4: 'c' },
    { defect_no: 2340, name: 'Seal Cracking', applies_to: ['other'], cs2: 'd', cs3: 'e', cs4: 'f' },
  ],
};

describe('syncReference', () => {
  it('copies the source byte for byte (creating the target folder) and returns the element and defect counts', () => {
    const { src, dest } = referenceDirs();
    const text = JSON.stringify(REF, null, 1) + '\n';
    writeFileSync(src, text, 'utf8');
    expect(syncReference({ src, dest })).toEqual({ elements: 1, defects: 2, bytes: Buffer.byteLength(text) });
    expect(readFileSync(dest, 'utf8')).toBe(text);
  });

  it('fails naming the path when the source is missing, and creates no target', () => {
    const { src, dest } = referenceDirs();
    expect(() => syncReference({ src, dest })).toThrow(src);
    expect(existsSync(dest)).toBe(false);
  });

  it('fails when it is not JSON or the elements/defects arrays are missing or empty, leaving an existing target as it is', () => {
    const { src, dest } = referenceDirs();
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, 'previous', 'utf8');
    writeFileSync(src, '{ nope', 'utf8');
    expect(() => syncReference({ src, dest })).toThrow(/JSON/);
    writeFileSync(src, JSON.stringify({ ...REF, defects: [] }), 'utf8');
    expect(() => syncReference({ src, dest })).toThrow(/defects/);
    writeFileSync(src, JSON.stringify({ ...REF, elements: undefined }), 'utf8');
    expect(() => syncReference({ src, dest })).toThrow(/elements/);
    expect(readFileSync(dest, 'utf8')).toBe('previous');
  });
});
