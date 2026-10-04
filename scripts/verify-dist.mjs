// ------------------------------------------------------------------
//  Build check — is this folder a publishable build of the app?
//
//    node scripts/verify-dist.mjs [dir]      (default: dist)
//
//  Reports index.html (lang · title), the referenced assets, secret keys, fixture mode, the Supabase
//  host inlined into the bundle, and the artifact check (scripts/lib/dist-guard.mjs). A build made
//  with placeholder Supabase values is reported as "GREEN · PENDING" and exits 0 — the build is
//  correct, and deploy.mjs refuses to publish it. Exit code 0 = GREEN.
// ------------------------------------------------------------------
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  artifactProblems,
  hasFixtureMarker,
  listFiles,
  readBundleJs,
  readIndexHtml,
  secretKeyProblems,
  SUPABASE_PLACEHOLDER_MARKERS,
  supabasePending,
} from './lib/dist-guard.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 16);

/** Supabase addresses inlined into the bundle (https://<ref>.supabase.co) */
const supabaseHosts = (jsText) =>
  [...new Set([...jsText.matchAll(/https:\/\/([A-Za-z0-9_-]+)\.supabase\.co/g)].map((m) => `${m[1]}.supabase.co`))].sort();

const dirArg = process.argv[2] ?? 'dist';
const dist = resolve(ROOT, dirArg);
if (!existsSync(join(dist, 'index.html')) || !existsSync(join(dist, 'assets'))) {
  console.error(`[verify-dist] not a build folder: ${dist}`);
  process.exit(1);
}

const html = readFileSync(join(dist, 'index.html'), 'utf8');
const info = readIndexHtml(html);
const js = readBundleJs(dist);
const files = listFiles(dist);
const secrets = secretKeyProblems(js);
const fixture = hasFixtureMarker(js);
const artifacts = artifactProblems(dist, join(ROOT, 'public'));
const pending = supabasePending(js);
const placeholder = SUPABASE_PLACEHOLDER_MARKERS.some((m) => js.includes(m));
const problems = [...secrets, ...(fixture ? ['fixture-mode build'] : []), ...artifacts];
const sizeMb = files.reduce((n, f) => n + statSync(join(dist, f)).size, 0) / 1024 / 1024;

console.log(`[verify-dist] ${dirArg}/`);
console.log(`  index.html  lang=${info.lang} · title="${info.title}" · sha ${sha(Buffer.from(html, 'utf8'))}`);
for (const a of info.assets) {
  if (existsSync(join(dist, a))) console.log(`  asset       /${a} ${sha(readFileSync(join(dist, a)))}`);
}
console.log(`  secrets     ${secrets.length ? `${secrets.length} ✘` : 'none'}`);
console.log(`  fixture     ${fixture ? 'present ✘' : 'none'}`);
console.log(`  supabase    ${supabaseHosts(js).join(' · ') || '(no address)'}${placeholder ? ' — placeholder' : ''}`);
console.log(`  artifacts   ${artifacts.length ? `${artifacts.length} ✘` : 'ok'} · ${files.length} files · ${sizeMb.toFixed(1)} MB`);
for (const p of problems) console.log('  ✘ ' + p);
for (const p of pending) console.log('  … ' + p);
if (problems.length) console.log(`RESULT: RED (${problems.length})`);
else console.log(pending.length ? `RESULT: GREEN · PENDING ${pending.length} — deploy.mjs refuses to publish this build` : 'RESULT: GREEN');
process.exit(problems.length ? 1 : 0);
