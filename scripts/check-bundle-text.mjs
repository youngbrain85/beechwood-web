// ------------------------------------------------------------------
//  Build check — the build output carries no Korean text.
//
//    node scripts/check-bundle-text.mjs [dir]      (default: dist)
//
//  The app is English only. This scans every text file of a build folder (js · css · html · json ·
//  svg · txt · map) for Hangul — literal characters and `\uXXXX` escapes alike — and lists each hit
//  with a little context. There is no allowlist: one hit fails the check. Exit code 0 = none found.
// ------------------------------------------------------------------
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Assigned Hangul code points: Jamo · Compatibility Jamo · Jamo Extended-A · Syllables · Jamo Extended-B.
 * Unassigned code points at the end of a block are left out, so that a range endpoint such as U+D7FF
 * in a library's character-class regex (the XML name range U+3001–U+D7FF) is not mistaken for text.
 */
const HANGUL_RANGES = [
  [0x1100, 0x11ff],
  [0x3131, 0x318e],
  [0xa960, 0xa97c],
  [0xac00, 0xd7a3],
  [0xd7b0, 0xd7fb],
];
const isHangulCode = (c) => HANGUL_RANGES.some(([lo, hi]) => c >= lo && c <= hi);

const TEXT_FILE = /\.(js|mjs|css|html|json|svg|txt|map)$/i;
const UNICODE_ESCAPE = /\\u\{?([0-9a-fA-F]{4,6})\}?/g;
const CONTEXT = 24;

/**
 * Hangul occurrences in one text — runs of literal characters and escapes that decode to Hangul.
 * Returns `{ index, text }` per run, `text` being the run with a few characters around it.
 */
export function hangulFindings(text) {
  const hits = [];
  let i = 0;
  while (i < text.length) {
    if (!isHangulCode(text.charCodeAt(i))) {
      i += 1;
      continue;
    }
    let j = i;
    while (j < text.length && (isHangulCode(text.charCodeAt(j)) || text[j] === ' ')) j += 1;
    hits.push({ index: i, text: snippet(text, i, j) });
    i = j;
  }
  for (const m of text.matchAll(UNICODE_ESCAPE)) {
    if (isHangulCode(parseInt(m[1], 16))) {
      hits.push({ index: m.index, text: snippet(text, m.index, m.index + m[0].length) });
    }
  }
  return hits.sort((a, b) => a.index - b.index);
}

function snippet(text, from, to) {
  return text.slice(Math.max(0, from - CONTEXT), Math.min(text.length, to + CONTEXT)).replace(/\s+/g, ' ');
}

/** Text files of a folder, recursively (paths relative to the folder, '/' separated, sorted). */
export function textFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (TEXT_FILE.test(name)) out.push(relative(dir, p).split('\\').join('/'));
    }
  };
  walk(dir);
  return out.sort();
}

/** Every Hangul occurrence in the text files of a build folder: `{ file, index, text }`. */
export function hangulInDir(dir) {
  return textFiles(dir).flatMap((file) =>
    hangulFindings(readFileSync(join(dir, file), 'utf8')).map((h) => ({ file, ...h })),
  );
}

function main(argv) {
  const dirArg = argv[0] ?? 'dist';
  const dir = resolve(dirArg);
  if (!existsSync(join(dir, 'index.html')) || !existsSync(join(dir, 'assets'))) {
    console.error(`[check-bundle-text] not a build folder: ${dir}`);
    return 2;
  }
  const files = textFiles(dir);
  const hits = hangulInDir(dir);
  console.log(`[check-bundle-text] ${dirArg}/ · ${files.length} text files · Korean text ${hits.length}`);
  for (const h of hits.slice(0, 50)) console.log(`  ! ${h.file} @${h.index}: ${h.text}`);
  if (hits.length > 50) console.log(`  … and ${hits.length - 50} more`);
  return hits.length ? 1 : 0;
}

// CLI only when run directly (importing it from a test does not run it)
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
