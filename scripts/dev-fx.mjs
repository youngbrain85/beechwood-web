// ------------------------------------------------------------------
//  Fixture-mode dev server — shows the screens locally without signing in (verification only).
//
//    node scripts/dev-fx.mjs        http://localhost:5203        (npm run dev:fixtures)
//
//  Data: .fixtures/beechwood.json — a snapshot of the pipeline seed, never committed
//        (npm run pipeline:fixtures creates it).
//  Nothing is written to a database — a registered damage is only recorded in window.__fxWrites.
//  scripts/dev-shots.mjs opens the same port.
// ------------------------------------------------------------------
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURE_PORT = 5203;
const FIXTURE = '.fixtures/beechwood.json';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (!existsSync(resolve(ROOT, FIXTURE))) {
  console.error(`no snapshot (${FIXTURE}) — run first: npm run pipeline:fixtures`);
  process.exit(1);
}
const child = spawn('npx', ['vite', '--port', String(FIXTURE_PORT), '--strictPort'], {
  cwd: ROOT,
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, VITE_FIXTURES: '1' },
});
child.on('exit', (code) => process.exit(code ?? 0));
