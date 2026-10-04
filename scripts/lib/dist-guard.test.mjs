// dist-guard.mjs — deploy guard: secret keys · fixture mode · artifacts · pending steps · verdict
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  artifactProblems,
  deployVerdict,
  guardDist,
  hasFixtureMarker,
  INDEX_HTML,
  PUBLIC_ENTRIES,
  readDeployTarget,
  readIndexHtml,
  secretKeyProblems,
  supabasePending,
  targetPending,
} from './dist-guard.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '../..');

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
const write = (dir, files) => {
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), body, 'utf8');
  }
};

const APP_JS = 'a="Beechwood",b="Damage Map",c="Sign Out"';
const REAL_SUPABASE = ';createClient("https://abcdefghijklmnopqrst.supabase.co","sb_publishable_x")';
const PLACEHOLDER_SUPABASE = ';createClient("https://REPLACE_ME.supabase.co","REPLACE_ME")';
const INDEX = `<!doctype html><html lang="en"><head><title>${INDEX_HTML.title}</title></head><body><script type="module" src="/assets/index-abc.js"></script></body></html>`;
const PUBLIC = {
  'vercel.json': '{"rewrites":[]}',
  'models3d/beechwood/BEECHWOOD.glb': 'glb',
  'models3d/beechwood/manifest.json': '{"groups":[]}',
  'sheets-beechwood/01_BW-DECK-TOP-A.svg': '<svg>1</svg>',
  'sheets-beechwood/02_BW-DECK-TOP-B.svg': '<svg>2</svg>',
  'proposal/frame_bw.svg': '<svg>frame</svg>',
  'proposal/frame_bw_meta.json': '{}',
};
const TARGET = { projectName: 'beechwood-web', projectId: 'prj_x', orgId: 'team_x', url: 'https://example.invalid' };

/** A public/ folder and the build made from it → { dist, pub } */
function makeBuild({ js = APP_JS + REAL_SUPABASE, index = INDEX, distExtra = {}, publicExtra = {} } = {}) {
  const root = tempDir('dist-guard-');
  const pub = join(root, 'public');
  const dist = join(root, 'dist');
  write(pub, { ...PUBLIC, ...publicExtra });
  write(dist, { ...PUBLIC, 'index.html': index, 'assets/index-abc.js': js, ...distExtra });
  return { dist, pub };
}

describe('hasFixtureMarker', () => {
  it('recognises a fixture-mode bundle', () => {
    expect(hasFixtureMarker('x="__FIXTURE_MODE__"')).toBe(true);
    expect(hasFixtureMarker(APP_JS)).toBe(false);
  });
});

describe('supabasePending — placeholder connection values are a step left, not a wrong build', () => {
  it('a bundle built without a filled-in .env → Supabase not configured', () => {
    const p = supabasePending(APP_JS + PLACEHOLDER_SUPABASE);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/^Supabase not configured/);
  });
  it('a placeholder key alone is recognised too', () => {
    expect(supabasePending(APP_JS + ';createClient("https://abcdefghijklmnopqrst.supabase.co","REPLACE_ME")')).toHaveLength(1);
  });
  it('real connection values → nothing pending', () => {
    expect(supabasePending(APP_JS + REAL_SUPABASE)).toEqual([]);
  });
});

const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (payload) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.c2lnbmF0dXJlLWZha2U`;
// Fake key values are assembled from fragments so that this file holds no key-shaped literal.
const FAKE_SECRET = 'sb_' + 'secret_AbC123xyz';
const ANON_JWT = jwt({ iss: 'supabase', ref: 'abcdefghijklmnopqrst', role: 'anon', iat: 1, exp: 2 });
const SERVICE_JWT = jwt({ iss: 'supabase', ref: 'abcdefghijklmnopqrst', role: 'service_role', iat: 1, exp: 2 });

describe('secretKeyProblems', () => {
  it('sb_secret_ key → problem (the key value is not in the message)', () => {
    const p = secretKeyProblems(`${APP_JS};createClient("https://x.supabase.co","${FAKE_SECRET}")`);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/sb_secret_/);
    expect(p[0]).not.toMatch(/AbC123xyz/);
  });
  it('service_role JWT → problem (the key value is not in the message)', () => {
    const p = secretKeyProblems(`${APP_JS};createClient("https://x.supabase.co","${SERVICE_JWT}")`);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/service_role/);
    expect(p[0]).not.toContain(SERVICE_JWT.split('.')[1]);
  });
  it('public keys (anon JWT · sb_publishable_) are fine', () => {
    expect(secretKeyProblems(`${APP_JS};createClient("https://x.supabase.co","${ANON_JWT}")`)).toEqual([]);
    expect(secretKeyProblems(APP_JS + REAL_SUPABASE)).toEqual([]);
  });
  it('a fragment that looks like a JWT but does not decode is skipped (no throw)', () => {
    expect(secretKeyProblems('x="eyJ' + 'hbGciOiJIUzI1.eyJ@@@notbase64.zzz"')).toEqual([]);
  });
});

describe('artifactProblems', () => {
  it('a build with index.html, its assets and every deployed public file → no problem', () => {
    const { dist, pub } = makeBuild();
    expect(artifactProblems(dist, pub)).toEqual([]);
  });
  it('the Vercel link deploy.mjs writes is not an unexpected file', () => {
    const { dist, pub } = makeBuild({ distExtra: { '.vercel/project.json': '{}' } });
    expect(artifactProblems(dist, pub)).toEqual([]);
  });
  it('no index.html → one problem', () => {
    const root = tempDir('dist-guard-');
    write(root, { 'dist/assets/index-abc.js': APP_JS });
    expect(artifactProblems(join(root, 'dist'), join(root, 'public'))).toHaveLength(1);
  });
  it('wrong lang or title', () => {
    const { dist, pub } = makeBuild({ index: INDEX.replace('lang="en"', 'lang="de"').replace(INDEX_HTML.title, 'Other') });
    const p = artifactProblems(dist, pub).join('\n');
    expect(p).toMatch(/lang="de"/);
    expect(p).toMatch(/title "Other"/);
  });
  it('index.html references a file that is not in the build', () => {
    const { dist, pub } = makeBuild({ index: INDEX.replace('index-abc.js', 'index-zzz.js') });
    expect(artifactProblems(dist, pub).join('\n')).toMatch(/missing file: assets\/index-zzz\.js/);
  });
  it('a deployed public file missing from the build, or different from public/', () => {
    const { dist, pub } = makeBuild({ distExtra: { 'sheets-beechwood/02_BW-DECK-TOP-B.svg': '<svg>changed</svg>' } });
    rmSync(join(dist, 'models3d/beechwood/BEECHWOOD.glb'));
    const p = artifactProblems(dist, pub);
    expect(p).toContain('artifact — missing from the build: models3d/beechwood/BEECHWOOD.glb');
    expect(p).toContain('artifact — differs from public/: sheets-beechwood/02_BW-DECK-TOP-B.svg');
    expect(p).toHaveLength(2);
  });
  it('fails closed — a file nobody listed is a problem (test-only data of public/ included)', () => {
    const extra = { 'models3d/v1/manifest.json': '{}', 'proposal/frame_other.svg': '<svg/>' };
    const { dist, pub } = makeBuild({ distExtra: extra, publicExtra: extra });
    expect(artifactProblems(dist, pub)).toEqual([
      'artifact — unexpected file in the build: models3d/v1/manifest.json',
      'artifact — unexpected file in the build: proposal/frame_other.svg',
    ]);
  });
  it('a listed entry that is absent from public/ itself is a problem', () => {
    const { dist, pub } = makeBuild();
    rmSync(join(pub, 'proposal/frame_bw.svg'));
    rmSync(join(dist, 'proposal/frame_bw.svg'));
    expect(artifactProblems(dist, pub)).toEqual(['artifact — public/proposal/frame_bw.svg is missing from the repository']);
  });
});

describe('this repository — the guard constants match the sources', () => {
  it('index.html at the root carries the expected lang and title', () => {
    const info = readIndexHtml(readFileSync(join(REPO, 'index.html'), 'utf8'));
    expect([info.lang, info.title]).toEqual([INDEX_HTML.lang, INDEX_HTML.title]);
  });
  it('every listed public entry exists in public/', () => {
    const { dist } = makeBuild();
    const missing = artifactProblems(dist, join(REPO, 'public')).filter((p) => p.includes('is missing from the repository'));
    expect(missing).toEqual([]);
    expect(PUBLIC_ENTRIES.length).toBeGreaterThan(0);
  });
});

describe('guardDist — secret keys · fixture mode · artifacts', () => {
  it('a correct build with real connection values → nothing', () => {
    const { dist, pub } = makeBuild();
    expect(guardDist(dist, pub)).toEqual({ problems: [], pending: [] });
  });
  it('a correct build with placeholder values → pending only', () => {
    const { dist, pub } = makeBuild({ js: APP_JS + PLACEHOLDER_SUPABASE });
    const r = guardDist(dist, pub);
    expect(r.problems).toEqual([]);
    expect(r.pending).toHaveLength(1);
  });
  it('a secret key in the bundle is a problem', () => {
    const { dist, pub } = makeBuild({ js: `${APP_JS};k="${SERVICE_JWT}"` });
    expect(guardDist(dist, pub).problems.join('\n')).toMatch(/service_role/);
  });
  it('a fixture-mode build is a problem', () => {
    const { dist, pub } = makeBuild({ js: `${APP_JS};m="__FIXTURE_MODE__"` });
    expect(guardDist(dist, pub).problems.join('\n')).toMatch(/fixture mode/);
  });
  it('an unexpected file is a problem even when the bundle is fine', () => {
    const { dist, pub } = makeBuild({ distExtra: { 'models3d/v1/OLD.glb': 'x' } });
    expect(guardDist(dist, pub).problems).toEqual(['artifact — unexpected file in the build: models3d/v1/OLD.glb']);
  });
  it('not a build folder (no assets/) → a problem, not a throw', () => {
    const r = guardDist(tempDir('dist-guard-'), tempDir('dist-guard-'));
    expect(r.problems).toHaveLength(1);
    expect(r.problems[0]).toMatch(/not a build folder/);
  });
});

describe('deploy target — a local, untracked file', () => {
  it('readDeployTarget: absent file → null, present file → its content', () => {
    const dir = tempDir('dist-guard-');
    expect(readDeployTarget(join(dir, 'deploy-targets.json'))).toBeNull();
    write(dir, { 'deploy-targets.json': JSON.stringify(TARGET) });
    expect(readDeployTarget(join(dir, 'deploy-targets.json'))).toEqual(TARGET);
  });
  it('targetPending: no target → one step, incomplete target → names the empty fields, complete → none', () => {
    expect(targetPending(null)).toHaveLength(1);
    expect(targetPending(null)[0]).toMatch(/^no deploy target/);
    expect(targetPending({ ...TARGET, projectId: '', orgId: '' })).toEqual([
      'deploy target incomplete — scripts/deploy-targets.json has no projectId · orgId',
    ]);
    expect(targetPending(TARGET)).toEqual([]);
  });
  it('the tracked example is incomplete on purpose (no project IDs in the repository)', () => {
    const example = readDeployTarget(join(REPO, 'scripts/deploy-targets.example.json'));
    expect([example.projectId, example.orgId, example.url]).toEqual(['', '', '']);
    expect(targetPending(example)).toHaveLength(1);
  });
});

describe('deployVerdict', () => {
  const last = (v) => v.lines[v.lines.length - 1];

  it('correct build · complete target → a dry run exits 0 without deploying, a real run deploys', () => {
    const { dist, pub } = makeBuild();
    const dry = deployVerdict(dist, pub, TARGET, { dryRun: true });
    expect([dry.exitCode, dry.deploy]).toEqual([0, false]);
    expect(last(dry)).toBe('[deploy] --dry-run — nothing was deployed');
    const real = deployVerdict(dist, pub, TARGET, { dryRun: false });
    expect([real.exitCode, real.deploy]).toEqual([0, true]);
    expect(real.lines.join('\n')).not.toMatch(/refused|✘|…/);
  });
  it('no deploy target → a dry run reports it and passes, a real run is refused', () => {
    const { dist, pub } = makeBuild();
    const dry = deployVerdict(dist, pub, null, { dryRun: true });
    expect([dry.exitCode, dry.deploy]).toEqual([0, false]);
    expect(dry.lines.join('\n')).toMatch(/no deploy target/);
    const real = deployVerdict(dist, pub, null, { dryRun: false });
    expect([real.exitCode, real.deploy]).toEqual([1, false]);
    expect(last(real)).toBe('[deploy] refused — nothing was deployed');
  });
  it('placeholder Supabase values → a dry run reports it and passes, a real run is refused', () => {
    const { dist, pub } = makeBuild({ js: APP_JS + PLACEHOLDER_SUPABASE });
    const dry = deployVerdict(dist, pub, TARGET, { dryRun: true });
    expect([dry.exitCode, dry.deploy]).toEqual([0, false]);
    expect(dry.lines.join('\n')).toMatch(/Supabase not configured/);
    expect(deployVerdict(dist, pub, TARGET, { dryRun: false })).toMatchObject({ exitCode: 1, deploy: false });
  });
  it('a problem refuses even a dry run', () => {
    const { dist, pub } = makeBuild({ js: `${APP_JS};k="${FAKE_SECRET}"` });
    const dry = deployVerdict(dist, pub, TARGET, { dryRun: true });
    expect([dry.exitCode, dry.deploy]).toEqual([1, false]);
    expect(dry.lines.join('\n')).not.toMatch(/AbC123xyz/);
  });
  it('not a build folder → refused, no throw', () => {
    const v = deployVerdict(tempDir('dist-guard-'), tempDir('dist-guard-'), TARGET, { dryRun: true });
    expect([v.exitCode, v.deploy]).toEqual([1, false]);
  });
});
