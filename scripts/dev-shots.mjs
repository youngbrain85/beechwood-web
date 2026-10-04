// ------------------------------------------------------------------
//  Fixture-mode screen captures and checks (verification only) — headless Chrome opens the screens
//  without signing in, saves PNGs and writes a report.
//
//    1. server:   npm run dev:fixtures                    (http://localhost:5203 — .fixtures/beechwood.json)
//    2. capture:  node scripts/dev-shots.mjs [scene,…]    → <scene>.png · report.txt in the current folder
//       scenes: overview · analysis · drawings · quantities · model · tree · register · proposals · photos
//               1600×1000; overview · drawings · model also once at 1024×768 (<scene>_1024). Default: all.
//
//  Every scene checks the facts that must be on screen (NBI component ratings · element CS quantities ·
//  AASHTO columns · the 7-member tree · 23 sheets in 7 families · proposal candidates and frame for
//  BW_BEAM_B2 · the defect / CS / quantity / unit registration form) against the page text and writes
//  OK or MISSING per fact, plus the number of lines containing Hangul (must be 0).
//  The photos scene (damage photos in the 3D damage details and in the sheet damage table) asserts instead:
//  a wrong assertion writes a FAIL line and the script ends with exit code 1.
//  Dependency: puppeteer-core is a devDependency (screen captures only); it drives an installed Chrome.
//          Set CHROME_PATH when Chrome lives elsewhere.
// ------------------------------------------------------------------
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';

// Fixture server port (scripts/dev-fx.mjs) and screen size
const PORT = 5203;
const WINDOW_SIZE = '1600,1000';
const VIEWPORT = { width: 1600, height: 1000 };
const only = process.argv[2] ? process.argv[2].split(',') : null;
const base = `http://localhost:${PORT}`;
const HANGUL = /[\uAC00-\uD7A3]/;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const report = [];

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: [`--window-size=${WINDOW_SIZE}`, '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--hide-scrollbars'],
  defaultViewport: { ...VIEWPORT, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => report.push(`[pageerror] ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') report.push(`[console.error] ${m.text().slice(0, 200)}`);
});

async function hangulLines(scene) {
  const lines = await page.evaluate(() =>
    document.body.innerText.split('\n').map((l) => l.trim()).filter((l) => /[\uAC00-\uD7A3]/.test(l)),
  );
  const uniq = [...new Set(lines)];
  report.push(`[${scene}] lines with Hangul ${uniq.length}${uniq.length ? ': ' + uniq.slice(0, 25).join(' ¦ ') : ''}`);
  return uniq;
}
async function shot(scene, opts = {}) {
  await page.screenshot({ path: `${scene}.png`, fullPage: !!opts.fullPage });
  await hangulLines(scene);
}
async function go(path, wait = 3500, waitUntil = 'networkidle2') {
  await page.goto(base + path, { waitUntil, timeout: 90000 });
  await sleep(wait);
}
async function clickText(text, tag = '*') {
  const ok = await page.evaluate(
    (text, tag) => {
      const els = [...document.querySelectorAll(tag)].filter(
        (e) => e.children.length === 0 || tag !== '*',
      );
      const el = els.find((e) => (e.textContent ?? '').trim() === text) ?? els.find((e) => (e.textContent ?? '').trim().startsWith(text));
      if (!el) return false;
      el.scrollIntoView({ block: 'center' });
      el.click();
      return true;
    },
    text,
    tag,
  );
  if (!ok) report.push(`  (click target not found: ${text})`);
  await sleep(1200);
  return ok;
}
const want = (s) => !only || only.includes(s);

// ══════════════════════════════════════════════════════════════════════════════════════════
//  Scenes at 1600x1000 (overview, drawings and model also get one shot at 1024x768).
//  Each scene checks "facts that must be visible" against the on-screen text (innerText, which reflects CSS uppercasing) and writes OK / MISSING.
//  Session writes (damage registration) vanish on a reload (the fake client is session-only), so checks after register navigate inside the app (clicks).
// ══════════════════════════════════════════════════════════════════════════════════════════
const text = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').trim());
/* Facts that must be visible: one OK / MISSING line per [name, regex] */
function expectFacts(scene, t, facts) {
  for (const [name, re] of facts) report.push(`  ${re.test(t) ? 'OK     ' : 'MISSING'} ${scene}: ${name}`);
}
async function waitFor(fn, ms, step = 500) {
  for (let t = 0; t < ms; t += step) {
    if (await page.evaluate(fn)) return true;
    await sleep(step);
  }
  return false;
}
/* Input id by (the start of) its label text; Mantine inputs are linked through label[for] */
const labelTarget = (prefix) =>
  page.evaluate((prefix) => {
    const l = [...document.querySelectorAll('label')].find((x) => (x.textContent ?? '').trim().startsWith(prefix));
    return l?.getAttribute('for') ?? null;
  }, prefix);
/* Opens the 3D view and waits for "Meshes N" in the header */
async function goModel() {
  await page.goto(base + '/model', { waitUntil: 'domcontentloaded', timeout: 90000 });
  const ok = await waitFor(() => /Meshes \d+/.test(document.body.innerText), 60000);
  await sleep(2500);
  return ok;
}
/* Clicks the canvas on a grid until the needle text appears (member info panel) */
async function pickUntil(needle) {
  const box = await (await page.$('canvas')).boundingBox();
  for (let fy = 0.5; fy <= 0.85; fy += 0.05) {
    for (const fx of [0.5, 0.45, 0.55, 0.4, 0.6, 0.35, 0.65, 0.3, 0.7]) {
      await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
      await sleep(300);
      if ((await text()).includes(needle)) return true;
    }
  }
  return false;
}
/* One more shot at 1024x768: reopens the same screen, captures and returns to 1600x1000 */
async function shot1024(scene, open) {
  await page.setViewport({ width: 1024, height: 768, deviceScaleFactor: 1 });
  await open();
  await shot(`${scene}_1024`);
  await page.setViewport({ ...VIEWPORT, deviceScaleFactor: 1 });
}
const MEMBERS = ['Deck', 'Beams', 'Interior bents', 'End bents', 'Bearings', 'Railing', 'Approach & joints'];
const assetHits = new Set();
{
  page.on('response', (r) => {
    const u = r.url().replace(base, '');
    if (/^\/(models3d|sheets|sheets-beechwood|proposal)\//.test(u) || u === '/sheet_planes.json') {
      assetHits.add(`${r.status()} ${(r.headers()['content-type'] ?? '').split(';')[0]} ${u.split('?')[0]}`);
    }
  });
}

if (want('overview')) {
  await go('/');
  expectFacts('overview', await text(), [
    ['Deck 8 Very Good', /DECK 8 Very Good/i],
    ['Superstructure 6 Satisfactory', /SUPERSTRUCTURE 6 Satisfactory/i],
    ['Substructure 8 Very Good', /SUBSTRUCTURE 8 Very Good/i],
    ['Overall condition FAIR', /OVERALL CONDITION FAIR/i],
    ['Objects 80 · Damage records 6 · Map sheets 23', /OBJECTS 80 DAMAGE RECORDS 6 MAP SHEETS 23/i],
    ['Element Condition Summary(10 elements)', /Element Condition Summary 10 AASHTO elements/i],
    ['Recent Damages 6', /Recent Damages Latest 6/i],
  ]);
  await shot('overview');
  await shot1024('overview', () => go('/'));
}

if (want('analysis')) {
  await go('/analysis');
  expectFacts('analysis', await text(), [
    ['Element Conditions table header(Unit · Total Qty · CS1~CS4 · Rating · Worst Defects)', /ELEMENT UNIT TOTAL QTY CS1 CS2 CS3 CS4 RATING WORST DEFECTS/i],
    ['Deck rating 8 · Superstructure 6 · Substructure 8 · Other not rated', /DECK — Computed rating 8.*SUPERSTRUCTURE — Computed rating 6.*SUBSTRUCTURE — Computed rating 8.*OTHER — Not rated/i],
    ['12 Deck CS quantities 8,304 / 12 · rating 8', /12 Reinforced Concrete Deck sq ft 8,316 8,304 99\.9% 12 0\.1% 0 0% 0 0% 8 Very Good/],
    ['109 Girder CS3 4 ft · rating 6(drives Superstructure 6)', /109 Prestressed Concrete Open Girder\/Beam ft 1,000 996 99\.6% 0 0% 4 0\.4% 0 0% 6 Satisfactory/],
    ['Active damages 6 · CS3 2 · CS4 0', /ACTIVE DAMAGES 6 CS3 2 · CS4 0/i],
  ]);
  await shot('analysis');
}

if (want('quantities')) {
  await go('/quantities');
  const t = await text();
  expectFacts('quantities', t, [
    ['AASHTO columns No. · Element · Defect · CS · Qty · Unit · Notes', /NO\. ELEMENT DEFECT CS QTY UNIT NOTES/i],
    ['Group by Object · Component · Condition State filters', /Group By Object Sheet Component All Deck Superstructure Substructure Other Condition State All CS1 CS2 CS3 CS4/],
    // The group heading "BW_BEAM_B2" and "1 damage" are adjacent inline elements, so innerText may have no space between them
    ['BW_BEAM_B2 · 109 · 1080 · CS3 · 4 ft', /BW_BEAM_B2 ?1 damage 1 109 Prestressed Concrete Open Girder\/Beam 1080 Delamination\/Spall\/Patched Area CS3 4 ft/],
  ]);
  report.push(`  [quantities] rows (Demo record) ${(t.match(/Demo record/g) ?? []).length}`);
  await shot('quantities');
}

if (want('drawings')) {
  await go('/drawings');
  expectFacts('drawings', await text(), [['7 families · 23 sheets', /7 families · 23 sheets/]]);
  // Collapses every family heading row so all 7 families fit one screen; each heading shows the family name and sheet count
  await page.evaluate(() => {
    for (const e of [...document.querySelectorAll('*')].filter((x) => x.children.length === 0 && (x.textContent ?? '').trim() === '▾')) {
      e.closest('tr')?.click();
    }
  });
  await sleep(1200);
  const families = await page.evaluate(() =>
    [...document.querySelectorAll('tr')]
      .map((tr) => tr.innerText.replace(/\s+/g, ' ').trim())
      .filter((l) => /^▸ .+ \d+ sheets/.test(l)),
  );
  const total = families.reduce((s, l) => s + Number(/(\d+) sheets/.exec(l)[1]), 0);
  report.push(`  [drawings] families ${families.length} · sheets total ${total}: ${families.join(' ¦ ')}`);
  await shot('drawings');
  await shot1024('drawings', () => go('/drawings'));
  // One sheet: the Span B interior face (1 damage on BW_BEAM_B2)
  await go('/drawings');
  const opened = await clickText('Beams — Interior Faces, Span B (Lines 2 & 3)', 'p');
  await sleep(3500);
  const img = await page.evaluate(() => {
    const i = [...document.querySelectorAll('img')].find((x) => /sheets-beechwood\//.test(x.src));
    return i ? { src: i.src.replace(location.origin, ''), w: i.naturalWidth, h: i.naturalHeight, complete: i.complete } : null;
  });
  report.push(`  [drawings] sheet opened ${opened} · image ${JSON.stringify(img)}`);
  expectFacts('drawings_sheet', await text(), [
    ['legend — AASHTO defect symbols', /LEGEND — AASHTO DEFECT SYMBOLS/i],
    ['Damages on This Sheet — 1 damage: 109 · BW_BEAM_B2 · 1080 · CS3 · 4 ft', /Damages on This Sheet ?1 damage 1 109 Prestressed Concrete Open Girder\/Beam BW_BEAM_B2 1080 Delamination\/Spall\/Patched Area CS3 4 ft/],
  ]);
  await shot('drawings_sheet');
}

if (want('model')) {
  const loaded = await goModel();
  const t = await text();
  report.push(`  [model] loaded ${loaded} · header ${(/Meshes \d+ · Damages \d+/.exec(t) ?? ['?'])[0]}`);
  expectFacts('model', t, [
    ['Meshes 84 (80 GLB objects + 4 ground)', /Meshes 84/],
    ['Condition State Heatmap toggle', /Condition State Heatmap/],
    ['Member Tree · Main Bridge 7', /Member Tree Show All ▾ Main Bridge 7/],
    ...MEMBERS.map((m) => [`tree member ${m}`, new RegExp(`▸ ${m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\d+`)]),
  ]);
  const scene = await page.evaluate(() => {
    const meshes = [];
    window.__view.scene.getObjectByName('bridge').traverse((o) => o.isMesh && meshes.push(o));
    return {
      meshes: meshes.length,
      objects: new Set(meshes.map((m) => m.userData.objectId).filter(Boolean)).size,
      ground: meshes.filter((m) => m.userData.fine === 'Ground').map((m) => m.name),
    };
  });
  report.push(`  [model] scene meshes ${scene.meshes} · objects ${scene.objects} · ground ${scene.ground.join(', ')}`);
  await shot('model');
  await clickText('Condition State Heatmap', 'label');
  await sleep(1500);
  expectFacts('model_heatmap', await text(), [
    ['legend CS1 Good 53 · CS2 Fair 4 · CS3 Poor 2 · CS4 Severe 0 · No AASHTO element 21', /CS1 Good 53 CS2 Fair 4 CS3 Poor 2 CS4 Severe 0 No AASHTO element 21/],
  ]);
  await shot('model_heatmap');
  const picked = await pickUntil('Member Info');
  const info = await text();
  report.push(`  [model] mesh picked ${picked} · ${(/Member Info .{0,260}/.exec(info) ?? ['(no member info)'])[0]}`);
  await shot('model_info');
  await shot1024('model', goModel);
}

if (want('tree')) {
  await goModel();
  // Expands the whole tree: opens each not-yet-opened row one by one (accordion) and collects the on-screen lines each time
  const visited = new Set();
  const allLines = new Set();
  const collect = async () => {
    for (const l of await page.evaluate(() => document.body.innerText.split('\n').map((x) => x.trim()).filter(Boolean))) allLines.add(l);
  };
  await collect();
  for (let i = 0; i < 100; i++) {
    const label = await page.evaluate((seen) => {
      for (const e of [...document.querySelectorAll('*')].filter((x) => x.children.length === 0 && (x.textContent ?? '').trim() === '▸')) {
        const row = e.parentElement;
        const key = (row?.textContent ?? '').trim();
        if (!row || seen.includes(key)) continue;
        row.click();
        return key;
      }
      return null;
    }, [...visited]);
    if (label === null) break;
    visited.add(label);
    await sleep(600);
    await collect();
  }
  const lines = [...allLines];
  report.push(`  [tree] opened ${visited.size} nodes · lines collected ${lines.length} · lines with Hangul ${lines.filter((l) => HANGUL.test(l)).length}`);
  report.push(`  [tree] opened nodes: ${[...visited].join(' ¦ ')}`);
  writeFileSync('tree_lines.txt', lines.join('\n') + '\n', 'utf8');
  // The capture is taken with the bearings (24) expanded, the longest member list
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('*')].find((x) => x.children.length === 0 && (x.textContent ?? '').trim() === 'Bearings')?.parentElement;
    row?.click();
  });
  await sleep(1000);
  await shot('tree');
}

if (want('register')) {
  await goModel();
  await clickText('Condition State Heatmap', 'label');
  await sleep(1500);
  const before = (/CS1 Good \d+ CS2 Fair \d+ CS3 Poor \d+ CS4 Severe \d+/.exec(await text()) ?? ['?'])[0];
  await page.evaluate(() => window.__isolate('BW_BEAM_B2'));
  await sleep(1500);
  const picked = await pickUntil('Member Info');
  report.push(`  [register] BW_BEAM_B2 picked ${picked} · member info ${(/Object BW_BEAM_B2/.test(await text()) ? 'BW_BEAM_B2' : '?')}`);
  await clickText('Register Damage', 'button');
  await sleep(1200);
  const labels = await page.evaluate(() => [...document.querySelectorAll('label')].map((l) => (l.textContent ?? '').replace('*', '').trim()));
  report.push(`  [register] form labels: ${labels.join(' ¦ ')}`);
  expectFacts('register_form', labels.join(' | '), [
    ['Defect', /(^|\| )Defect( \||$)/],
    ['Condition State(CS1~CS4)', /Condition State/i],
    ['Quantity', /(^|\| )Quantity( \||$)/],
    ['Unit', /(^|\| )Unit( \||$)/],
  ]);
  // Defect 1110, CS4, 2 ft, notes
  const defectId = await labelTarget('Defect');
  if (defectId) {
    await page.click(`#${defectId}`);
    await sleep(800);
    const chose = await page.evaluate(() => {
      const opt = [...document.querySelectorAll('[role="option"]')].find((x) => (x.textContent ?? '').trim() === '1110 Cracking (PSC)');
      opt?.click();
      return !!opt;
    });
    report.push(`  [register] defect 1110 Cracking (PSC) chosen ${chose}`);
    await sleep(600);
  }
  await page.evaluate(() => document.querySelector('input[type="radio"][value="4"]')?.click());
  const qtyId = await labelTarget('Quantity');
  if (qtyId) await page.type(`#${qtyId}`, '2');
  const notesId = await labelTarget('Notes');
  if (notesId) await page.type(`#${notesId}`, 'dev-shots register scene (fixture only)');
  await sleep(600);
  const unit = await page.evaluate(() => {
    const l = [...document.querySelectorAll('label')].find((x) => (x.textContent ?? '').trim().startsWith('Unit'));
    const el = l ? document.getElementById(l.getAttribute('for')) : null;
    return el ? { value: el.value, disabled: el.disabled || el.readOnly } : null;
  });
  report.push(`  [register] unit field ${JSON.stringify(unit)}`);
  await shot('register_form');
  await clickText('Register', 'button');
  await sleep(2500);
  const writes = await page.evaluate(() => JSON.parse(JSON.stringify(window.__fxWrites ?? [])));
  writeFileSync('fxWrites.json', JSON.stringify(writes, null, 1), 'utf8');
  report.push(`  [register] __fxWrites ${writes.length}`);
  for (const w of writes) report.push(`    ${w.table ?? '?'}: ${JSON.stringify(w.row ?? w.values ?? w).slice(0, 300)}`);
  await page.evaluate(() => window.__isolate(null));
  await sleep(1500);
  const after = await text();
  report.push(`  [register] legend before "${before}" -> after "${(/CS1 Good \d+ CS2 Fair \d+ CS3 Poor \d+ CS4 Severe \d+/.exec(after) ?? ['?'])[0]}"`);
  expectFacts('register_after', after, [
    ['heat map legend CS3 Poor 1 · CS4 Severe 1 (without a reload)', /CS3 Poor 1 CS4 Severe 1/],
    ['Member Info Worst CS CS4', /Worst CS CS4/],
  ]);
  await shot('register_after');
  // To the dashboard by in-app navigation: is the session registration reflected in the NBI ratings and recent damages
  await clickText('Dashboard', 'a');
  await sleep(3000);
  expectFacts('register_overview', await text(), [
    ['Superstructure 5 (109 CS4 2/1000 ft, minimum rule)', /SUPERSTRUCTURE 5/i],
    ['Damage records 7', /DAMAGE RECORDS 7/i],
    ['Recent Damages first row 1110 Cracking (PSC) · BW_BEAM_B2', /Recent Damages Latest 6 1110 Cracking \(PSC\).{0,40}BW_BEAM_B2/i],
  ]);
  await shot('register_overview');
}

if (want('proposals')) {
  await go('/proposals?ids=BW_BEAM_B2', 15000, 'domcontentloaded');
  const done = await waitFor(
    () =>
      document.querySelectorAll('[data-testid="candidate-card"]').length > 0 ||
      /Could not build|No surface to draw|Too large to handle/.test(document.body.innerText),
    90000,
  );
  await waitFor(() => !!document.querySelector('g[data-role="keyplan-hatch"]'), 30000);
  await sleep(2000);
  const cards = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="candidate-card"]')].map((c) =>
      (c.lastElementChild ?? c).innerText.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 3).join(' · '),
    ),
  );
  const frame = await page.evaluate(() => {
    const g = document.querySelector('g[data-role="keyplan-hatch"]');
    const svg = g?.closest('svg');
    return {
      viewBox: svg?.getAttribute('viewBox') ?? null,
      hatchRects: g ? g.querySelectorAll('rect').length : 0,
      beechwoodTitle: !!svg && /BEECHWOOD/i.test(svg.textContent ?? ''),
      frameError: /Could not load the sheet frame/.test(document.body.innerText),
      stats: document.querySelector('[data-testid="engine-stats"]')?.textContent?.trim() ?? null,
    };
  });
  report.push(`  [proposals] BW_BEAM_B2 · candidates ready ${done} · cards ${cards.length}: ${cards.join(' ¦ ')}`);
  report.push(`  [proposals] preview ${JSON.stringify(frame)}`);
  expectFacts('proposals', `${cards.length} ${JSON.stringify(frame)}`, [
    ['candidates for BW_BEAM_B2 (at least 1)', /^[1-9]/],
    ['bw frame (BEECHWOOD title) · KEY PLAN hatch · no frame error', /"hatchRects":[1-9]\d*,"beechwoodTitle":true,"frameError":false/],
  ]);
  await shot('proposals');
}

// ══════════════════════════════════════════════════════════════════════════════════════════
//  Damage photos (read only): 3D damage details -> thumbnails -> enlarged view (arrow keys, Esc), then the
//  sheet damage table: a row opens to its photos and key facts, and Esc closes the enlarged photo only.
//  The photo rows are synthesized in fixture mode (src/dev/fixturePhotos.ts): by snapshot order of the
//  damages, i % 3 = 0 has 2 photos, 1 has 3 (one broken on purpose) + 1 deleted, 2 has none. The expected
//  counts below are worked out here from that pattern, independently of the app.
//  A wrong assertion writes a FAIL line, sets exit code 1 and marks the capture file name with _FAIL,
//  so a wrong screen is never saved under the name of a right one.
// ══════════════════════════════════════════════════════════════════════════════════════════
let failed = 0;
function check(ok, what) {
  report.push(`  [photos] ${ok ? 'PASS' : 'FAIL'} ${what}`);
  if (!ok) {
    failed++;
    process.exitCode = 1;
  }
  return ok;
}
const photoShot = (name, ok) => shot(ok ? name : `${name}_FAIL`);
const ONLY_ENLARGE = /^(Enlarge photo \([^)]*\))( \| Enlarge photo \([^)]*\))*$/;

/* Target: the BW_BEAM_B2 damage (3 photos); bare: a damage without photos that sits on a sheet */
async function photoTargets() {
  return page.evaluate(async () => {
    const db = await (await fetch('/__fx/db.json')).json();
    const info = (d, i) => {
      const kind = i % 3;
      const sheet = (db.sheets ?? []).find((s) => s.id === d.sheet_id);
      return {
        id: d.id,
        photos: kind === 0 ? 2 : kind === 1 ? 3 : 0,
        broken: kind === 1 ? 1 : 0,
        deleted: kind === 1 ? 1 : 0,
        objectCode: (db.objects ?? []).find((o) => o.id === d.object_id)?.object_code ?? null,
        sheetKey: sheet?.zone_spec?.sheet_id ?? null,
        sheetTitle: sheet?.title ?? null,
        round: d.inspections?.round_label ?? null,
      };
    };
    const all = (db.damages ?? []).map(info);
    return {
      inSnapshot: Array.isArray(db.damage_photos) ? db.damage_photos.length : null,
      target: all.find((d) => d.objectCode === 'BW_BEAM_B2' && d.photos === 3) ?? null,
      bare: all.find((d) => d.photos === 0 && d.sheetKey) ?? null,
    };
  });
}

/* The enlarged view: title (position n / N) and body (round, time taken, tablet file) */
const lightbox = () =>
  page.evaluate(() => {
    const lb = document.querySelector('[data-testid="photo-lightbox"]');
    if (!lb) return null;
    const title = lb.closest('.mantine-Modal-content')?.querySelector('.mantine-Modal-title');
    return {
      title: (title?.innerText ?? '').replace(/\s+/g, ' ').trim(),
      info: lb.innerText.replace(/\s+/g, ' ').trim().slice(0, 200),
      img: !!lb.querySelector('img'),
    };
  });
const posOf = (lb) => (lb?.title.match(/(\d+) \/ (\d+)/) ?? []).slice(1).map(Number);

/* The open sheet modal (not the enlarged view): its title and whether the row is still open */
const sheetModal = (id) =>
  page.evaluate((id) => {
    const contents = [...document.querySelectorAll('.mantine-Modal-content')].filter(
      (c) => !c.querySelector('[data-testid="photo-lightbox"]'),
    );
    const sheet = contents.find((c) => c.querySelector('tr[data-damage-id]'));
    if (!sheet) return null;
    return {
      title: (sheet.querySelector('.mantine-Modal-title')?.innerText ?? '').replace(/\s+/g, ' ').trim(),
      expanded: !!sheet.querySelector(`tr[data-damage-detail="${id}"]`),
    };
  }, id);

/* Width of the sheet damage table and the thumbnail strip of the opened row */
const sheetTable = (id) =>
  page.evaluate((id) => {
    const tr = document.querySelector(`tr[data-damage-id="${id}"]`);
    const table = tr?.closest('table');
    if (!table) return null;
    const row = document.querySelector(`tr[data-damage-detail="${id}"]`);
    const strip = row?.querySelector('[data-photo-key]')?.parentElement?.parentElement ?? null;
    return {
      tableW: Math.round(table.getBoundingClientRect().width),
      holderW: table.parentElement ? table.parentElement.clientWidth : null,
      strip: strip ? { clientW: strip.clientWidth, scrollW: strip.scrollWidth, overflowX: getComputedStyle(strip).overflowX } : null,
      thumbs: row ? row.querySelectorAll('[data-photo-key]').length : 0,
      broken: row ? row.querySelectorAll('[data-photo-key] svg').length : 0,
      loaded: row ? [...row.querySelectorAll('[data-photo-key] img')].filter((i) => i.complete && i.naturalWidth > 0).length : 0,
      text: row ? row.innerText.replace(/\s+/g, ' ').trim().slice(0, 320) : null,
      info: row ? (row.querySelector('[data-testid="damage-info"]')?.innerText ?? '').replace(/\s+/g, ' ').trim() : null,
      // photos are read only on the web: no control that adds, deletes or uploads
      controls: row ? [...row.querySelectorAll('button, input, a')].map((e) => e.getAttribute('aria-label') ?? e.tagName).join(' | ') : null,
    };
  }, id);

async function openSheetRow(sheetKey, id) {
  await go(`/drawings?sheet=${encodeURIComponent(sheetKey)}`, 5000);
  const before = await sheetTable(id);
  const opened = await page.evaluate((id) => {
    const tr = document.querySelector(`tr[data-damage-id="${id}"]`);
    if (!tr) return false;
    tr.click();
    return true;
  }, id);
  await sleep(2500);
  await page.evaluate((id) => document.querySelector(`tr[data-damage-detail="${id}"]`)?.scrollIntoView({ block: 'center' }), id);
  await sleep(800);
  return { opened, before, after: await sheetTable(id) };
}

/* The opened row must not widen the table; the thumbnails scroll sideways inside their strip */
function checkRow(tag, r, t) {
  const limit = Math.max(r.before?.tableW ?? 0, r.after?.holderW ?? 0) + 1;
  const a = r.after;
  const ok1 = check(!!a && a.tableW <= limit, `${tag}: table width ${r.before?.tableW} -> ${a?.tableW} (limit ${limit}), the photo strip does not widen the table`);
  const ok2 = check(a?.thumbs === t.photos, `${tag}: thumbnails ${a?.thumbs}/${t.photos} (the deleted photo is not shown)`);
  const ok3 = check(!!a?.strip && a.strip.overflowX === 'auto' && a.strip.clientW <= limit, `${tag}: thumbnail strip client ${a?.strip?.clientW} / scroll ${a?.strip?.scrollW} (${a?.strip?.overflowX})`);
  const ok4 = check(a?.broken === t.broken && a?.loaded === t.photos - t.broken, `${tag}: images loaded ${a?.loaded}/${t.photos - t.broken} · broken icon ${a?.broken}/${t.broken}`);
  return ok1 && ok2 && ok3 && ok4;
}

if (want('photos')) {
  await go('/');
  const { target: t, bare, inSnapshot } = await photoTargets();
  report.push(`  [photos] target ${JSON.stringify(t)} · no-photo damage ${JSON.stringify(bare)} · damage_photos in the snapshot file ${inSnapshot}`);
  if (check(!!t, 'a BW_BEAM_B2 damage with 3 synthesized photos exists')) {
    // ---- 3D view: damage details panel
    await goModel();
    // Other markers are hidden inside the page for the click only: a nearer marker would take it.
    // The click handler of the app skips markers that are not visible.
    const markers = await page.evaluate((id) => {
      const list = [];
      window.__view?.scene?.traverse((o) => o.userData?.isDamageMarker && list.push(o));
      window.__shotHidden = [];
      for (const c of list) {
        if (c.userData.damageId !== id && c.visible) {
          c.visible = false;
          window.__shotHidden.push(c);
        }
      }
      return { total: list.length, hidden: window.__shotHidden.length };
    }, t.id);
    report.push(`  [photos] damage markers ${markers.total} · others hidden for the click ${markers.hidden}`);
    await sleep(500);
    const camOf = () =>
      page.evaluate(() => {
        const c = window.__view.camera;
        return [...c.position.toArray(), ...c.quaternion.toArray()].map((n) => Number(n.toFixed(4))).join(',');
      });
    const pt = await page.evaluate((id) => {
      let m = null;
      window.__view?.scene?.traverse((o) => {
        if (o.userData?.isDamageMarker && o.userData.damageId === id) m = o;
      });
      const canvas = document.querySelector('canvas');
      if (!m || !canvas) return null;
      const p = m.getWorldPosition(new m.position.constructor()).project(window.__view.camera);
      const r = canvas.getBoundingClientRect();
      return {
        x: Math.round(r.left + ((p.x + 1) / 2) * r.width),
        y: Math.round(r.top + ((1 - p.y) / 2) * r.height),
        inView: Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1 && p.z < 1,
      };
    }, t.id);
    report.push(`  [photos] marker on screen ${JSON.stringify(pt)}`);
    if (check(!!pt?.inView, '3D: the target marker is inside the default view')) {
      const camBefore = await camOf();
      await page.mouse.click(pt.x, pt.y);
      await sleep(2500);
      const panel = await page.evaluate(() => {
        const box = document.querySelector('[data-testid="damage-photos"]');
        if (!box) return null;
        const paper = box.closest('.mantine-Paper-root');
        const strip = box.querySelector('[data-photo-key]')?.parentElement?.parentElement;
        return {
          text: box.innerText.replace(/\s+/g, ' ').trim().slice(0, 160),
          thumbs: box.querySelectorAll('[data-photo-key]').length,
          broken: box.querySelectorAll('[data-photo-key] svg').length,
          loaded: [...box.querySelectorAll('[data-photo-key] img')].filter((i) => i.complete && i.naturalWidth > 0).length,
          sizes: [...new Set([...box.querySelectorAll('[data-photo-key]')].map((b) => `${b.offsetWidth}x${b.offsetHeight}`))].join(' '),
          panelText: (paper?.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 400),
          panelW: paper ? Math.round(paper.getBoundingClientRect().width) : null,
          strip: strip ? { overflowX: getComputedStyle(strip).overflowX, scrollW: strip.scrollWidth, clientW: strip.clientWidth } : null,
          controls: [...box.querySelectorAll('button, input, a')].map((e) => e.getAttribute('aria-label') ?? e.tagName).join(' | '),
        };
      });
      report.push(`  [photos] 3D photo block ${JSON.stringify(panel && { text: panel.text, thumbs: panel.thumbs, broken: panel.broken, loaded: panel.loaded, sizes: panel.sizes, panelW: panel.panelW, strip: panel.strip })}`);
      report.push(`  [photos] 3D panel text: ${panel?.panelText ?? '(no panel)'}`);
      const match = check(
        !!panel && /Damage Details/.test(panel.panelText) && panel.panelText.includes(t.objectCode) && panel.thumbs === t.photos,
        `3D panel is the target: ${t.objectCode} · thumbnails ${panel?.thumbs ?? '-'}/${t.photos}`,
      );
      const facts = [
        match,
        check(/^PHOTOS 3 photos/i.test(panel?.text ?? ''), '3D photo block heading "Photos" and count "3 photos"'),
        check(panel?.loaded === t.photos - t.broken && panel?.broken === t.broken, `3D images loaded ${panel?.loaded}/${t.photos - t.broken} · broken icon ${panel?.broken}/${t.broken}`),
        check(panel?.sizes === '140x105', `3D thumbnail size ${panel?.sizes} = 140x105`),
        check(panel?.panelW === 330, `3D panel width ${panel?.panelW} = 330 (unchanged)`),
        check(!!panel?.strip && panel.strip.overflowX === 'auto' && panel.strip.clientW <= 330, `3D thumbnail strip scrolls inside the panel (client ${panel?.strip?.clientW} / scroll ${panel?.strip?.scrollW})`),
        check((await camOf()) === camBefore, '3D camera did not move when the damage was opened'),
        check(ONLY_ENLARGE.test(panel?.controls ?? ''), `3D photo block is read only: its only controls enlarge a photo (${panel?.controls})`),
      ];
      await photoShot('photos_3d_panel', facts.every(Boolean));
      if (match) {
        await page.click('[data-testid="damage-photos"] [data-photo-key]');
        await sleep(1500);
        const lb1 = await lightbox();
        report.push(`  [photos] enlarged ${JSON.stringify(lb1)}`);
        const p1 = [
          check(posOf(lb1)[0] === 1 && posOf(lb1)[1] === t.photos, `3D enlarged view opens at 1 / ${t.photos}`),
          check(new RegExp(`Round ${t.round} Taken \\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2} Tablet file fx_`).test(lb1?.info ?? ''), 'enlarged view shows round, time taken and the tablet file of the first photo'),
        ];
        await photoShot('photos_3d_lightbox', p1.every(Boolean));
        await page.keyboard.press('ArrowRight');
        await sleep(800);
        const lb2 = await lightbox();
        report.push(`  [photos] enlarged (right) ${JSON.stringify(lb2)}`);
        const p2 = [
          check(posOf(lb2)[0] === 2, '3D enlarged view: right arrow goes to 2'),
          check(/Photo unavailable/.test(lb2?.info ?? '') && !lb2?.img, 'the broken photo shows "Photo unavailable" in the enlarged view'),
          check(!/Tablet file/.test(lb2?.info ?? ''), 'no "Tablet file" line for a photo without a device file name'),
        ];
        await photoShot('photos_3d_lightbox_next', p2.every(Boolean));
        await page.keyboard.press('ArrowLeft');
        await sleep(800);
        check(posOf(await lightbox())[0] === 1, '3D enlarged view: left arrow goes back to 1');
        await page.keyboard.press('Escape');
        await sleep(800);
        const closed = (await lightbox()) == null;
        const still = await page.evaluate(() => !!document.querySelector('[data-testid="damage-photos"]'));
        const e = [check(closed, '3D: Esc closes the enlarged view'), check(still, '3D: the damage details panel stays open after Esc')];
        await photoShot('photos_3d_after_esc', e.every(Boolean));
      }
    }
    const restored = await page.evaluate(() => {
      const list = window.__shotHidden ?? [];
      for (const c of list) c.visible = true;
      window.__shotHidden = [];
      return list.length;
    });
    report.push(`  [photos] hidden markers restored ${restored}`);

    // ---- Damage Map: sheet damage table
    if (check(!!t.sheetKey, 'the target damage is on a sheet')) {
      const r = await openSheetRow(t.sheetKey, t.id);
      report.push(`  [photos] sheet row opened ${r.opened} ${JSON.stringify(r.after)}`);
      const rowOk = [
        checkRow('sheet (1600)', r, t),
        check(
          new RegExp(`Object Code ${t.objectCode} Round ${t.round} Observations 1 Last Observed \\d{4}-\\d{2}-\\d{2} Location .+ Repair Method .+ Registered On \\d{4}-\\d{2}-\\d{2}`).test(r.after?.info ?? ''),
          'opened row shows the key facts (object code, round, observations, last observed, location, repair method, registered on)',
        ),
        check(ONLY_ENLARGE.test(r.after?.controls ?? ''), `opened row is read only: its only controls enlarge a photo (${r.after?.controls})`),
      ];
      await photoShot('photos_sheet_row', rowOk.every(Boolean));

      await page.click(`tr[data-damage-detail="${t.id}"] [data-photo-key]`);
      await sleep(1500);
      const d1 = await lightbox();
      report.push(`  [photos] sheet enlarged ${JSON.stringify(d1)}`);
      const l1 = check(posOf(d1)[0] === 1 && posOf(d1)[1] === t.photos, `sheet enlarged view opens at 1 / ${t.photos}`);
      await photoShot('photos_sheet_lightbox', l1);
      await page.keyboard.press('ArrowLeft');
      await sleep(800);
      check(posOf(await lightbox())[0] === t.photos, `sheet enlarged view: left arrow wraps from the first to the last (${t.photos})`);
      await page.keyboard.press('ArrowRight');
      await sleep(800);
      check(posOf(await lightbox())[0] === 1, 'sheet enlarged view: right arrow wraps from the last to the first');
      await page.keyboard.press('Escape');
      await sleep(800);
      const d4 = await lightbox();
      const sm = await sheetModal(t.id);
      report.push(`  [photos] after Esc: enlarged ${JSON.stringify(d4)} · sheet modal ${JSON.stringify(sm)}`);
      const e = [
        check(d4 == null, 'sheet: Esc closes the enlarged view'),
        check(!!sm && sm.title.includes(t.sheetTitle), 'sheet: the sheet modal is still open after that Esc'),
        check(!!sm?.expanded, 'sheet: the opened row is still open after that Esc'),
      ];
      await photoShot('photos_sheet_after_esc', e.every(Boolean));
      if (sm) {
        await page.keyboard.press('Escape');
        await sleep(800);
        check((await sheetModal(t.id)) == null, 'sheet: with no enlarged view, Esc closes the sheet modal (as before)');
      }

      // A damage without photos
      if (check(!!bare, 'a damage without photos exists on a sheet')) {
        const nb = await openSheetRow(bare.sheetKey, bare.id);
        report.push(`  [photos] no-photo row opened ${nb.opened} ${JSON.stringify(nb.after)}`);
        const noneOk = check(!!nb.after && nb.after.thumbs === 0 && /No photos/.test(nb.after.text ?? ''), 'a damage without photos shows "No photos" and no thumbnail');
        await photoShot('photos_sheet_nophoto', noneOk);
      }

      // Phone portrait (375x812): the opened row does not widen the table, the enlarged view is full screen
      await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 1 });
      const ph = await openSheetRow(t.sheetKey, t.id);
      report.push(`  [photos] phone row opened ${ph.opened} ${JSON.stringify(ph.after)}`);
      await photoShot('photos_sheet_row_phone', checkRow('sheet (375)', ph, t));
      await page.click(`tr[data-damage-detail="${t.id}"] [data-photo-key]`);
      await sleep(1500);
      const pl = await lightbox();
      await photoShot('photos_sheet_lightbox_phone', check(posOf(pl)[0] === 1, 'phone: the enlarged view opens'));
      await page.keyboard.press('Escape');
      await sleep(800);
      check((await sheetModal(t.id))?.expanded === true, 'phone: sheet modal and opened row stay after Esc');
      await page.setViewport({ ...VIEWPORT, deviceScaleFactor: 1 });
    }
  }
  report.push(`  [photos] failed assertions ${failed}${failed ? ' — exit code 1' : ''}`);
}

{
  report.push('[assets] network (model · sheets · frame · sheet planes):');
  for (const a of [...assetHits].sort()) report.push(`  ${a}`);
}

await browser.close();
writeFileSync('report.txt', report.join('\n') + '\n', 'utf8');
console.log(report.join('\n'));
