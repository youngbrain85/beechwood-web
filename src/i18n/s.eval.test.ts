// ------------------------------------------------------------------
//  AASHTO/NBI screen text table (s.eval.ts) — English.
//
//  Checks that **every value** of the table (nested tables; functions called with sample arguments)
//    (1) has no Hangul and uses only printable ASCII + typographic punctuation (em dash, en dash, middle dot, ellipsis),
//    (2) is non-empty with no leading or trailing whitespace, and
//    (3) does not hard-code the bridge name (the profile provides it: bridge.texts).
// ------------------------------------------------------------------
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as S from './s.eval';

/* Printable ASCII + four punctuation marks (U+00B7, U+2013, U+2014, U+2026) */
const ENGLISH = /^[\x20-\x7E·–—…]+$/;
const HANGUL = /[\uAC00-\uD7A3]/;

/* Walks the table to the leaves collecting [path, string]; functions are called with as many sample values (3) as they take. */
function collect(value: unknown, path: string, out: Array<[string, string]>): void {
  if (typeof value === 'string') {
    out.push([path, value]);
  } else if (typeof value === 'function') {
    const args = Array.from({ length: value.length }, () => 3);
    collect((value as (...a: unknown[]) => unknown)(...args), `${path}()`, out);
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => collect(v, `${path}[${i}]`, out));
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) collect(v, `${path}.${k}`, out);
  } else {
    out.push([path, String(value)]);
  }
}

const ALL: Array<[string, string]> = [];
for (const [name, table] of Object.entries(S)) collect(table, name, ALL);

describe('s.eval: AASHTO/NBI screen texts', () => {
  it('the table is not empty (it holds the texts of several screens)', () => {
    expect(ALL.length).toBeGreaterThan(100);
  });

  it('every value is English: no Hangul, only printable ASCII and the punctuation marks', () => {
    expect(ALL.filter(([, v]) => HANGUL.test(v))).toEqual([]);
    expect(ALL.filter(([, v]) => !ENGLISH.test(v))).toEqual([]);
  });

  it('no empty values and no leading or trailing whitespace', () => {
    expect(ALL.filter(([, v]) => v.length === 0 || v !== v.trim())).toEqual([]);
  });

  it('does not hard-code the bridge name; it comes from the profile (bridge.texts)', () => {
    expect(ALL.filter(([, v]) => /Beechwood/i.test(v))).toEqual([]);
  });

  it('condition states CS1-CS4, the three components, the three bands and NBI ratings 0-9 are all present', () => {
    expect(S.SEval.csName).toEqual({ 1: 'Good', 2: 'Fair', 3: 'Poor', 4: 'Severe' });
    expect(S.SEval.component).toMatchObject({ deck: 'Deck', super: 'Superstructure', sub: 'Substructure' });
    expect(S.SEval.band).toEqual({ good: 'Good', fair: 'Fair', poor: 'Poor' });
    expect(S.SEval.ratingWord).toHaveLength(10);
    expect(S.SEval.ratingWord[9]).toBe('Excellent');
    expect(S.SEval.ratingWord[0]).toBe('Failed');
  });

  it('says that NBI ratings are indicators computed from element condition, not official ratings', () => {
    expect(S.SEval.computedNote).toMatch(/Computed from element condition states/);
    expect(S.SEval.computedNote).toMatch(/not an official NBI/i);
  });

  it('the seven column names of the printed element quantity table (No. / Element / Defect / CS / Qty / Unit / Notes)', () => {
    expect(S.SQtyCols).toEqual(['No.', 'Element', 'Defect', 'CS', 'Qty', 'Unit', 'Notes']);
  });

  it('the 8 defect glyph legend entries + other, in the printed LEGEND wording', () => {
    expect(S.SEval.symbol).toMatchObject({
      crack: 'Cracking',
      spall: 'Spall / delamination',
      rebar: 'Exposed rebar',
      efflor: 'Efflorescence / rust staining',
      abrasion: 'Abrasion / wear',
      corrosion: 'Corrosion',
      leakage: 'Leakage / seal damage',
      settlement: 'Settlement / scour',
    });
    expect(typeof S.SEval.symbol.other).toBe('string');
  });
});

// ------------------------------------------------------------------
//  No unused texts: every key of the table is used by screen code (src, tests excluded).
//  A key counts as used when written as `SEval.a.b`, or when an ancestor table is read dynamically like `SEval.a[...]` (condition states, components, glyphs, rating descriptors).
// ------------------------------------------------------------------
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.tsx?$/.test(name) && !/\.test\.ts$/.test(name) && name !== 's.eval.ts' ? [p] : [];
  });
}

/* Leaf paths of the table (descends nested objects only; arrays, functions and strings are leaves) */
function keyPaths(value: unknown, prefix: string): string[] {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.entries(value).flatMap(([k, v]) => keyPaths(v, prefix ? `${prefix}.${k}` : k));
  }
  return [prefix];
}

describe('s.eval: no unused texts', () => {
  it('screen code uses every key of SEval', () => {
    const code = sourceFiles('src')
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');
    const used = (path: string): boolean => {
      const parts = path.split('.');
      // A dot becomes [.] (regex special character); an identifier character after the key means a different key (SEval.form.errCs is not SEval.form.errCsX)
      if (new RegExp(`SEval[.]${parts.join('[.]')}(?![A-Za-z0-9_])`).test(code)) return true;
      // Is an ancestor table read dynamically: SEval.csName[cs], SEval.component[cat] ...
      for (let i = 1; i < parts.length; i++) {
        if (code.includes(`SEval.${parts.slice(0, i).join('.')}[`)) return true;
      }
      return false;
    };
    expect(keyPaths(S.SEval, '').filter((p) => !used(p))).toEqual([]);
  });
});
