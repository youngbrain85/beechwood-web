// vite.config.ts — the parts of the build configuration that can be checked in isolation:
//   1. the fixed build constants
//   2. Supabase connection values: from .env, placeholder when missing
//   3. the transitional plugin that keeps test-only public files out of the build
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import configFn, { SUPABASE_PLACEHOLDER, supabaseEnv } from '../../vite.config.ts';
import { SUPABASE_PLACEHOLDER_MARKERS } from './dist-guard.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

// temporary folders are removed after every test
const made = [];
afterEach(() => {
  for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tempDir = (prefix) => {
  const d = mkdtempSync(join(tmpdir(), prefix));
  made.push(d);
  return d;
};

describe('vite configuration — one fixed target', () => {
  it('the only build constant is the build id, whatever the mode', () => {
    for (const mode of ['production', 'development', 'test']) {
      const d = configFn({ mode, command: 'build' }).define;
      expect(Object.keys(d).filter((k) => k.startsWith('__')).sort()).toEqual(['__BUILD_ID__']);
    }
  });
  it('both Supabase connection values are always defined', () => {
    const d = configFn({ mode: 'production', command: 'build' }).define;
    expect(Object.keys(d).filter((k) => k.startsWith('import.meta.env.')).sort()).toEqual([
      'import.meta.env.VITE_SUPABASE_KEY',
      'import.meta.env.VITE_SUPABASE_URL',
    ]);
  });
});

describe('supabaseEnv — connection values come from .env', () => {
  const dirWith = (files) => {
    const d = tempDir('vite-env-');
    for (const [name, body] of Object.entries(files)) writeFileSync(join(d, name), body, 'utf8');
    return d;
  };

  it('no .env → placeholder', () => {
    expect(supabaseEnv(dirWith({}))).toEqual({ url: 'https://REPLACE_ME.supabase.co', key: 'REPLACE_ME', placeholder: true });
  });
  it('values of .env (comments · blank lines · quotes · export allowed)', () => {
    const env = supabaseEnv(
      dirWith({
        '.env': '# project\n\nexport VITE_SUPABASE_URL="https://bwbwbwbwbwbwbwbwbwbw.supabase.co"\nVITE_SUPABASE_KEY=\'sb_publishable_abc\' # publishable\n',
      }),
    );
    expect(env).toEqual({ url: 'https://bwbwbwbwbwbwbwbwbwbw.supabase.co', key: 'sb_publishable_abc', placeholder: false });
  });
  it('.env.local overrides .env, key by key', () => {
    const env = supabaseEnv(
      dirWith({
        '.env': 'VITE_SUPABASE_URL=https://aaaaaaaaaaaaaaaaaaaa.supabase.co\nVITE_SUPABASE_KEY=sb_publishable_file\n',
        '.env.local': 'VITE_SUPABASE_KEY=sb_publishable_local\n',
      }),
    );
    expect(env).toEqual({ url: 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co', key: 'sb_publishable_local', placeholder: false });
  });
  it('an empty value counts as missing — that key alone falls back to the placeholder', () => {
    const env = supabaseEnv(dirWith({ '.env': 'VITE_SUPABASE_URL=https://aaaaaaaaaaaaaaaaaaaa.supabase.co\nVITE_SUPABASE_KEY=\n' }));
    expect(env).toEqual({ url: 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co', key: 'REPLACE_ME', placeholder: true });
  });
  it('placeholder = the values of .env.example = the markers the deploy guard looks for', () => {
    const env = supabaseEnv(dirWith({ '.env': readFileSync(join(ROOT, '.env.example'), 'utf8') }));
    expect(env).toEqual({ ...SUPABASE_PLACEHOLDER, placeholder: true });
    const bundled = `createClient(${JSON.stringify(env.url)},${JSON.stringify(env.key)})`;
    expect(SUPABASE_PLACEHOLDER_MARKERS.every((m) => bundled.includes(m))).toBe(true);
  });
});
