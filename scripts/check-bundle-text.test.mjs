// check-bundle-text.mjs — unit tests. Sample Hangul is built from code points so that this file
// itself stays free of Korean text.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { hangulFindings, hangulInDir, textFiles } from './check-bundle-text.mjs';

const SYLLABLES = String.fromCharCode(0xad50, 0xb7c9); // two Hangul syllables
const JAMO = String.fromCharCode(0x3131); // one compatibility jamo
const ESCAPE = '\\u' + 'ad50';

describe('hangulFindings', () => {
  it('finds nothing in English text, punctuation and other scripts', () => {
    expect(hangulFindings('const a="Deck slab — STA 105+76.0–106+66.0 · ▾ ×";')).toEqual([]);
    expect(hangulFindings('')).toEqual([]);
  });

  it('reports one hit per run of Hangul, with context', () => {
    const hits = hangulFindings(`const a="${SYLLABLES}",b="x",c='${SYLLABLES} ${SYLLABLES}';`);
    expect(hits).toHaveLength(2);
    expect(hits[0].text).toContain(SYLLABLES);
    expect(hits[0].index).toBe(9);
  });

  it('finds a lone jamo', () => {
    expect(hangulFindings(`x=${JAMO}`)).toHaveLength(1);
  });

  it('finds escapes that decode to Hangul, and ignores other escapes', () => {
    expect(hangulFindings(`a="${ESCAPE}"`)).toHaveLength(1);
    expect(hangulFindings('a="\\u2014 \\u00d7 \\u{1F600}"')).toEqual([]);
  });

  it('does not take the unassigned end of a block for text (the XML name range of a library regex)', () => {
    expect(hangulFindings('/[\\u3001-\\uD7FF\\uF900-\\uFDCF]/')).toEqual([]);
    expect(hangulFindings('/[\\u3001-\\uD7A3]/')).toHaveLength(1);
  });
});

describe('hangulInDir', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bundle-text-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('scans text files recursively and skips binary files', () => {
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'index.html'), '<html lang="en"><title>ok</title></html>');
    writeFileSync(join(dir, 'assets/app.js'), `const t="${SYLLABLES}";`);
    writeFileSync(join(dir, 'assets/app.css'), '.a{color:red}');
    writeFileSync(join(dir, 'assets/model.glb'), SYLLABLES);
    expect(textFiles(dir)).toEqual(['assets/app.css', 'assets/app.js', 'index.html']);
    const hits = hangulInDir(dir);
    expect(hits.map((h) => h.file)).toEqual(['assets/app.js']);
  });
});
