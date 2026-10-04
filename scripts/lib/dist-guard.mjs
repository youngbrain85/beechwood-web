// ------------------------------------------------------------------
//  Deploy guard — "may this build folder be published?"
//
//  Problems (a wrong build — always refused):
//    1. secret keys   a Supabase secret key (sb_secret_…) or a service_role JWT in the public bundle
//    2. fixture mode  the bundle carries the fake database client used for local verification
//    3. artifacts     index.html (lang · title · referenced assets), the public assets the app loads
//                     (model · sheets · proposal frame) byte-identical to public/, and nothing else
//                     in the folder (fails closed on files nobody listed)
//
//  Pending (a correct build, but the operator has a step left — a dry run reports it and passes,
//  a real deploy is refused):
//    - placeholder Supabase connection values (the build was made without a filled-in .env)
//    - no deploy target yet (scripts/deploy-targets.json is a local, untracked file)
// ------------------------------------------------------------------
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** FIXTURE_MARKER of src/dev/fakeClient.ts */
export const FIXTURE_MARKER = '__FIXTURE_MODE__';

/** How the placeholder values of `.env.example` look once inlined into the bundle. */
export const SUPABASE_PLACEHOLDER_MARKERS = ['REPLACE_ME.supabase.co', '"REPLACE_ME"'];

/** What index.html must say (the source is the index.html at the repository root). */
export const INDEX_HTML = { lang: 'en', title: 'Beechwood Bridge — Visual Inspection' };

/** Files of public/ that are deployed — a trailing '/' means everything below that folder. */
export const PUBLIC_ENTRIES = [
  'vercel.json', // SPA rewrite
  'models3d/beechwood/', // BEECHWOOD.glb + manifest.json   (npm run pipeline:model)
  'sheets-beechwood/', // damage-map sheets                 (npm run pipeline:sheets)
  'proposal/frame_bw.svg', // sheet-proposal frame          (npm run pipeline:sheets)
  'proposal/frame_bw_meta.json',
];

/** What vite itself writes into the output folder. */
export const BUILD_OUTPUTS = ['index.html', 'assets/'];

/** The Vercel link deploy.mjs writes into the output folder right before deploying. */
export const LINK_FILE = '.vercel/project.json';

const matches = (entry, rel) => (entry.endsWith('/') ? rel.startsWith(entry) : rel === entry);
const isPublicEntry = (rel) => PUBLIC_ENTRIES.some((e) => matches(e, rel));
const isBuildOutput = (rel) => BUILD_OUTPUTS.some((e) => matches(e, rel));

/** Every file below `dir` as a '/'-separated path relative to it, sorted. */
export function listFiles(dir) {
  const out = [];
  const go = (d) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) go(p);
      else out.push(relative(dir, p).split('\\').join('/'));
    }
  };
  if (existsSync(dir)) go(dir);
  return out.sort();
}

/** All assets/*.js of a build folder, concatenated. */
export function readBundleJs(distDir) {
  const dir = join(distDir, 'assets');
  if (!existsSync(dir)) throw new Error(`not a build folder (no assets/): ${distDir}`);
  return readdirSync(dir)
    .filter((f) => f.endsWith('.js'))
    .sort()
    .map((f) => readFileSync(join(dir, f), 'utf8'))
    .join('\n');
}

export function hasFixtureMarker(jsText) {
  return jsText.includes(FIXTURE_MARKER);
}

/** Placeholder connection values → one pending line (empty when the bundle has real values). */
export function supabasePending(jsText) {
  return SUPABASE_PLACEHOLDER_MARKERS.some((m) => jsText.includes(m))
    ? [
        'Supabase not configured — the bundle was built with placeholder connection values (REPLACE_ME). ' +
          'Fill in .env (project URL and publishable key) and rebuild.',
      ]
    : [];
}

const JWT_RE = /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;

/**
 * Secret keys in the public bundle → problem lines. The key value never appears in a line.
 *  - `sb_secret_…` (Supabase secret key)
 *  - a JWT whose payload has `role: "service_role"` (legacy secret key — an anon JWT is fine)
 */
export function secretKeyProblems(jsText) {
  const out = [];
  if (/sb_secret_[A-Za-z0-9_-]/.test(jsText)) {
    out.push('secret key — the bundle contains a Supabase secret key (sb_secret_…); a public site carries the publishable key only');
  }
  let service = false;
  for (const m of jsText.matchAll(JWT_RE)) {
    try {
      const payload = JSON.parse(Buffer.from(m[0].split('.')[1], 'base64url').toString('utf8'));
      if (payload && payload.role === 'service_role') service = true;
    } catch {
      /* looks like a JWT but does not decode — not a key */
    }
  }
  if (service) out.push('secret key — the bundle contains a service_role JWT; a public site carries the anon (publishable) key only');
  return out;
}

/** index.html text → { lang, title, assets[] } */
export function readIndexHtml(html) {
  const lang = /<html[^>]*\slang="([^"]*)"/.exec(html)?.[1] ?? null;
  const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? null;
  const assets = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]);
  return { lang, title, assets: [...new Set(assets)].sort() };
}

/**
 * Artifact check → problem lines.
 * @param {string} distDir build output folder
 * @param {string} publicDir the repository's public/ folder (source of the deployed assets)
 */
export function artifactProblems(distDir, publicDir) {
  const out = [];
  const indexPath = join(distDir, 'index.html');
  if (!existsSync(indexPath)) return [`artifact — no index.html in ${distDir}`];
  const info = readIndexHtml(readFileSync(indexPath, 'utf8'));
  if (info.lang !== INDEX_HTML.lang) out.push(`artifact — index.html lang="${info.lang}" (expected "${INDEX_HTML.lang}")`);
  if (info.title !== INDEX_HTML.title) out.push(`artifact — index.html title "${info.title}" (expected "${INDEX_HTML.title}")`);
  if (!info.assets.some((a) => a.endsWith('.js'))) out.push('artifact — index.html references no script under assets/');
  for (const a of info.assets) {
    if (!existsSync(join(distDir, a))) out.push(`artifact — index.html references a missing file: ${a}`);
  }

  const publicFiles = listFiles(publicDir).filter(isPublicEntry);
  for (const entry of PUBLIC_ENTRIES) {
    if (!publicFiles.some((f) => matches(entry, f))) out.push(`artifact — public/${entry} is missing from the repository`);
  }
  for (const rel of publicFiles) {
    const p = join(distDir, rel);
    if (!existsSync(p)) out.push(`artifact — missing from the build: ${rel}`);
    else if (!readFileSync(p).equals(readFileSync(join(publicDir, rel)))) out.push(`artifact — differs from public/: ${rel}`);
  }
  for (const rel of listFiles(distDir)) {
    if (rel === LINK_FILE || isBuildOutput(rel) || isPublicEntry(rel)) continue;
    out.push(`artifact — unexpected file in the build: ${rel}`);
  }
  return out;
}

/** Secret keys · fixture mode · artifacts → { problems, pending } */
export function guardDist(distDir, publicDir) {
  let js;
  try {
    js = readBundleJs(distDir);
  } catch (e) {
    return { problems: [e.message], pending: [] };
  }
  const problems = [
    ...secretKeyProblems(js),
    ...(hasFixtureMarker(js) ? ['fixture mode — the bundle carries the fake database client; never deploy it'] : []),
    ...artifactProblems(distDir, publicDir),
  ];
  return { problems, pending: supabasePending(js) };
}

/** The local deploy target (scripts/deploy-targets.json) → object, or null when the file is absent. */
export function readDeployTarget(file) {
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** Deploy target not usable yet → pending lines. */
export function targetPending(target) {
  if (!target) {
    return [
      'no deploy target — copy scripts/deploy-targets.example.json to scripts/deploy-targets.json (untracked) ' +
        'and fill in projectName · projectId · orgId · url of the Vercel project',
    ];
  }
  const empty = ['projectName', 'projectId', 'orgId'].filter((k) => !target[k]);
  return empty.length ? [`deploy target incomplete — scripts/deploy-targets.json has no ${empty.join(' · ')}`] : [];
}

/**
 * Deploy verdict (deploy.mjs prints and follows it) → { exitCode, deploy, lines }.
 *  - any problem: refused (exit 1), dry run or not
 *  - pending steps only: a dry run reports them and exits 0; a real deploy is refused (exit 1)
 *  - neither: a dry run exits 0; a real run returns deploy: true
 * @param {string} distDir
 * @param {string} publicDir
 * @param {object | null} target readDeployTarget()
 * @param {{ dryRun: boolean }} opts
 */
export function deployVerdict(distDir, publicDir, target, { dryRun }) {
  const { problems, pending: buildPending } = guardDist(distDir, publicDir);
  const pending = [...targetPending(target), ...buildPending];
  const lines = [`[deploy] ${distDir} → ${target?.projectName || '(no deploy target)'}${target?.url ? ` (${target.url})` : ''}`];
  for (const p of problems) lines.push('  ✘ ' + p);
  if (!problems.length) lines.push('  ✔ secret keys · fixture mode · artifacts');
  if (pending.length) {
    lines.push(`  … ${pending.length} step(s) left before deploying:`);
    for (const p of pending) lines.push('    - ' + p);
  }
  if (problems.length || (!dryRun && pending.length)) {
    lines.push('[deploy] refused — nothing was deployed');
    return { exitCode: 1, deploy: false, lines };
  }
  if (dryRun) {
    lines.push(
      pending.length
        ? `[deploy] --dry-run — the build passes; finish the ${pending.length} step(s) above before deploying (nothing was deployed)`
        : '[deploy] --dry-run — nothing was deployed',
    );
    return { exitCode: 0, deploy: false, lines };
  }
  return { exitCode: 0, deploy: true, lines };
}
