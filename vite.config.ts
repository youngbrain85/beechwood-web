import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));

/**
 * Fixture mode (verification only) — active only when `VITE_FIXTURES=1`:
 *   - `@/lib/supabase` is aliased to the fake client (src/dev/fakeSupabase.ts), and
 *   - the dev server serves `.fixtures/beechwood.json` (git-ignored snapshot of the pipeline seed,
 *     created by `npm run pipeline:fixtures`) as `/__fx/db.json`.
 * Without the flag nothing here runs. Start it with `npm run dev:fixtures`.
 */
const FIXTURES = process.env.VITE_FIXTURES === '1';
const FX_DB = join(ROOT, '.fixtures/beechwood.json');
const FX_HOWTO = 'npm run pipeline:fixtures';
let warnedMissingFixture = false;

const fixtureServer = (): Plugin => ({
  name: 'fixture-server',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use('/__fx/db.json', (_req, res) => {
      if (!existsSync(FX_DB)) {
        if (!warnedMissingFixture) {
          warnedMissingFixture = true;
          console.warn(`[fixture] snapshot not found: ${FX_DB} — run: ${FX_HOWTO}`);
        }
        res.statusCode = 404;
        res.end(`no fixture — run: ${FX_HOWTO}`);
        return;
      }
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      createReadStream(FX_DB).pipe(res);
    });
  },
});

/**
 * Supabase connection values come from `.env` (and `.env.local`) — see `.env.example`. When a value
 * is missing the build uses the same placeholder as `.env.example`: the app then connects to no
 * database, and the deploy guard (scripts/lib/dist-guard.mjs) refuses to publish that build.
 * Only the files are read, not the shell environment, so a build never picks up connection values
 * that happen to be exported in the terminal or injected by a test runner.
 */
export const SUPABASE_PLACEHOLDER = { url: 'https://REPLACE_ME.supabase.co', key: 'REPLACE_ME' } as const;
export interface SupabaseEnv {
  url: string;
  key: string;
  /** true when either value fell back to the placeholder */
  placeholder: boolean;
}

/** One KEY=VALUE file (the common dotenv shapes: comments, blank lines, `export`, quotes, trailing # comment). */
function readEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2]!;
    const quote = value[0];
    const close = quote === '"' || quote === "'" ? value.indexOf(quote, 1) : -1;
    value = close > 0 ? value.slice(1, close) : value.replace(/\s+#.*$/, '').trim();
    out[m[1]!] = value;
  }
  return out;
}

/** VITE_SUPABASE_URL / VITE_SUPABASE_KEY from `<root>/.env`, overridden key by key by `<root>/.env.local`. */
export function supabaseEnv(root: string): SupabaseEnv {
  const files = ['.env', '.env.local'].filter((f) => existsSync(join(root, f)));
  const merged: Record<string, string> = Object.assign({}, ...files.map((f) => readEnvFile(join(root, f))));
  const url = merged.VITE_SUPABASE_URL || SUPABASE_PLACEHOLDER.url;
  const key = merged.VITE_SUPABASE_KEY || SUPABASE_PLACEHOLDER.key;
  return { url, key, placeholder: url === SUPABASE_PLACEHOLDER.url || key === SUPABASE_PLACEHOLDER.key };
}

/** `define` entries that inline the connection values. */
export const supabaseDefines = (env: { url: string; key: string }): Record<string, string> => ({
  'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.url),
  'import.meta.env.VITE_SUPABASE_KEY': JSON.stringify(env.key),
});

/** Tells the builder, once, that the bundle carries placeholder connection values. */
const supabasePlaceholderNote = (): Plugin => ({
  name: 'supabase-placeholder-note',
  apply: 'build',
  buildStart() {
    console.log(
      `[supabase] placeholder connection values (${SUPABASE_PLACEHOLDER.url}) — .env is missing or incomplete. ` +
        'This build connects to no database and the deploy guard rejects it.',
    );
  },
});

export default defineConfig(() => {
  const supabase = supabaseEnv(ROOT);
  return {
    define: {
      // Cache busting for the model and its manifest — their file names are fixed, so the app
      // appends `?v=<build id>` to keep browsers from reusing an older copy.
      __BUILD_ID__: JSON.stringify(Date.now().toString(36)),
      ...supabaseDefines(supabase),
    },
    plugins: [
      react(),
      ...(FIXTURES ? [fixtureServer()] : []),
      ...(supabase.placeholder && !FIXTURES ? [supabasePlaceholderNote()] : []),
    ],
    resolve: {
      alias: [
        // Most specific first — only fixture mode swaps the Supabase client for the fake one.
        ...(FIXTURES
          ? [
              {
                find: '@/lib/supabase',
                replacement: fileURLToPath(new URL('./src/dev/fakeSupabase.ts', import.meta.url)),
              },
            ]
          : []),
        { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
      ],
    },
    server: {
      port: 5199,
    },
    build: {
      chunkSizeWarningLimit: 1500,
      rollupOptions: {
        output: {
          manualChunks: {
            three: ['three', 'three-mesh-bvh'],
            mantine: ['@mantine/core', '@mantine/hooks'],
          },
        },
      },
    },
  };
});
