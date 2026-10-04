// ------------------------------------------------------------------
//  Guarded deploy — publishes dist/ to the Vercel project named in the local deploy target.
//
//    node scripts/deploy.mjs --dry-run     verdict only (deploys nothing)
//    node scripts/deploy.mjs               deploy
//
//  The deploy target is scripts/deploy-targets.json — a local, untracked file (start from
//  scripts/deploy-targets.example.json). The verdict (scripts/lib/dist-guard.mjs deployVerdict)
//  refuses a build with secret keys, a fixture-mode build, or wrong artifacts, and refuses a real
//  deploy while the target is missing or the bundle carries placeholder Supabase values.
//
//  The deploy runs **inside** the output folder (`vercel deploy --prod --yes`) after writing the
//  project link there: handing the folder to the CLI as an argument, or deploying an unlinked
//  folder, makes the CLI create a new project named after the folder.
// ------------------------------------------------------------------
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deployVerdict, LINK_FILE, readDeployTarget } from './lib/dist-guard.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const unknown = args.filter((a) => a !== '--dry-run');
if (unknown.length) {
  console.error('usage: deploy.mjs [--dry-run]');
  process.exit(2);
}
const dist = join(ROOT, 'dist');
const target = readDeployTarget(join(ROOT, 'scripts/deploy-targets.json'));

const verdict = deployVerdict(dist, join(ROOT, 'public'), target, { dryRun: args.includes('--dry-run') });
for (const line of verdict.lines) console.log(line);
if (!verdict.deploy) process.exit(verdict.exitCode);

const link = join(dist, LINK_FILE);
mkdirSync(dirname(link), { recursive: true });
writeFileSync(link, JSON.stringify({ projectId: target.projectId, orgId: target.orgId, projectName: target.projectName }), 'utf8');
const r = spawnSync('npx', ['vercel', 'deploy', '--prod', '--yes'], { cwd: dist, stdio: 'inherit', shell: true });
if (r.status !== 0) {
  console.error(`[deploy] vercel failed (exit ${r.status})`);
  process.exit(r.status ?? 1);
}
console.log(`[deploy] done${target.url ? ` — production address: ${target.url}` : ''}`);
