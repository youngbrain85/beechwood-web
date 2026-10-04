// ------------------------------------------------------------------
//  App assets imported from the pipeline: the public/ files the bridge profile points at exist and have the shape the app uses.
//    - 3D model     public/models3d/beechwood/{manifest.json, BEECHWOOD.glb}   <- npm run pipeline:model
//    - sheets       public/sheets-beechwood/<original file name>.svg           <- npm run pipeline:sheets
//    - sheet frame  public/proposal/frame_bw.svg, frame_bw_meta.json          <- npm run pipeline:sheets
//  With the fixture (.fixtures/beechwood.json) it also checks that its sheets resolve to dashboard URLs (without it only that group is skipped).
//  Whether the imported files equal the pipeline repository (beechwood-pipeline) originals is checked **only when switched on**:
//  npm run pipeline:verify (= BEECHWOOD_PIPELINE_CHECK=1). It compares against the working tree of a sibling repository, so in the
//  default suite it would turn this repository's gate red whenever the pipeline is mid-work (regenerating, on another branch).
// ------------------------------------------------------------------
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Manifest } from '@/lib/glb/loader';
import { box } from '@/lib/proposal/__fixtures__/shapes';
import { composeSheetSvg, type FrameMeta } from '@/lib/proposal/compose';
import { runEngine } from '@/lib/proposal/engine';
import { NO_CLIP } from '@/lib/proposal/types';
import { dirOf, sheetSvgUrl } from '@/lib/siteUrl';
import manifestJson from '../../../public/models3d/beechwood/manifest.json';
import ids from './__fixtures__/objects.ids.json';
import { beechwoodProfile as p } from './index';
import { BW_MEMBERS } from './objects';
import { buildTree } from './tree';

/* The loader's Manifest type; that this assignment compiles is itself the "shape the loader reads" check (npm run typecheck). */
const manifest: Manifest = manifestJson;
/* Profile path (site-root based '/models3d/...') to the repository file (public/...) */
const pub = (url: string): string => join('public', url);

interface GlbJson {
  extensionsUsed?: string[];
  extensionsRequired?: string[];
  nodes: Array<{ name?: string; mesh?: number }>;
}
/* JSON chunk of the GLB container (after the 12-byte header + 8 bytes of chunk length and type) */
function glbJson(path: string): GlbJson {
  const buf = readFileSync(path);
  expect(buf.toString('ascii', 0, 4)).toBe('glTF');
  expect(buf.toString('ascii', 16, 20)).toBe('JSON');
  return JSON.parse(buf.toString('utf8', 20, 20 + buf.readUInt32LE(12))) as GlbJson;
}

describe('3D model: manifest.json (the loader Manifest shape)', () => {
  it('is the file the profile model.manifestUrl points at', () => {
    expect(JSON.parse(readFileSync(pub(p.model.manifestUrl), 'utf8'))).toEqual(manifestJson);
  });

  it('has the header fields (version, units, frame) and one group BEECHWOOD/BEECHWOOD.glb', () => {
    expect([manifest.version, manifestJson.units, manifestJson.frame]).toEqual([
      'v1',
      'm',
      'x=transverse(+right), y=(EL-400ft), z=(STA-106+21)',
    ]);
    expect(manifest.groups.map((g) => [g.group, g.file])).toEqual([['BEECHWOOD', 'BEECHWOOD.glb']]);
  });

  it('objects = objects.json rows: groups[0].objects.length === objects.json length (80), in id order', () => {
    const objs = manifest.groups[0]!.objects;
    expect(objs.length).toBe(ids.length);
    expect(objs.map((o) => o.id)).toEqual(ids);
    for (const o of objs) {
      expect(o.file).toBe('BEECHWOOD.glb');
      expect(o.name).not.toBe('');
      expect(o.el).toMatch(/^EL \d+\.\d\d ~ \d+\.\d\d ft$/);
    }
  });

  it('the member tree (Model.tsx builds it from the manifest ids) has seven members', () => {
    const tree = buildTree(manifest.groups[0]!.objects.map((o) => o.id));
    expect(tree.map((n) => n.label)).toEqual([...BW_MEMBERS]);
  });
});

describe('3D model: BEECHWOOD.glb', () => {
  const group = manifest.groups[0]!;
  const glbPath = join(pub(dirOf(p.model.manifestUrl)), group.file);

  it('sits next to the manifest, and sizeKB is the real file size (rounded KB)', () => {
    expect(Math.round(statSync(glbPath).size / 1024)).toBe(group.sizeKB);
  });

  it('is meshopt-compressed (EXT_meshopt_compression; the loader sets MeshoptDecoder)', () => {
    expect(glbJson(glbPath).extensionsUsed).toContain('EXT_meshopt_compression');
  });

  it('mesh nodes = 80 manifest objects + 4 ground meshes (BW_GROUND, BW_GROUND_RIPRAP_S/N, BW_GROUND_WATER)', () => {
    const names = glbJson(glbPath)
      .nodes.filter((n) => n.mesh !== undefined)
      .map((n) => n.name ?? '')
      .sort();
    expect(names).toEqual([...ids, 'BW_GROUND', 'BW_GROUND_RIPRAP_N', 'BW_GROUND_RIPRAP_S', 'BW_GROUND_WATER'].sort());
  });

  it('every mesh node resolves through the profile: an object (objectCode = node name) or ground (Ground), never "Other"', () => {
    const decoded = glbJson(glbPath)
      .nodes.filter((n) => n.mesh !== undefined)
      .map((n) => n.name ?? '')
      .map((name) => [name, p.objectInfo('BEECHWOOD', name, { x: 0, z: 0 })] as const);
    const ground = decoded.filter(([, info]) => info.fine === 'Ground').map(([name]) => name).sort();
    expect(ground).toEqual(['BW_GROUND', 'BW_GROUND_RIPRAP_N', 'BW_GROUND_RIPRAP_S', 'BW_GROUND_WATER']);
    for (const [name, info] of decoded) {
      if (info.fine === 'Ground') expect(info.objectCode).toBe('');
      else expect([name, info.fine !== 'Other', info.objectCode]).toEqual([name, true, name]);
    }
  });
});

describe('sheets: public/sheets-beechwood (profile sheetsBase)', () => {
  const dir = pub(p.sheetsBase);
  const files = readdirSync(dir).sort();

  it('23 sheets with the pipeline file names (NN_BW-....svg), A3 (420x297) or A1 (841x594) SVG', () => {
    expect(files).toHaveLength(23);
    for (const f of files) {
      expect(f).toMatch(/^\d\d_BW-[A-Z0-9-]+\.svg$/);
      expect(readFileSync(join(dir, f), 'utf8')).toMatch(/^<svg [^>]*viewBox="0 0 (420 297|841 594)"/);
    }
  });
});

describe('sheet frame: public/proposal/frame_bw.* (profile frames.templates.bw)', () => {
  const t = p.frames.templates.bw!;
  const tpl = readFileSync(pub(t.svg), 'utf8');
  const meta = JSON.parse(readFileSync(pub(t.meta), 'utf8')) as FrameMeta;

  it('composing with the real template + metrics draws the KEY PLAN hatch on an A3 sheet (the metrics have a bw entry)', () => {
    // One box for the Span B deck (piers 2-3, z +-13.716 m)
    const c = runEngine({ meshes: [box([-5, 0, -13.716], [5, 2, 13.716], 'BW_DECK_B')], clip: NO_CLIP, objectCodes: ['BW_DECK_B'] })[0]!;
    const kind = p.frames.kindFor(c.spec.zone.bounds);
    const svg = composeSheetSvg({ template: tpl, meta, kind, spec: c.spec, drawing: c.drawing, title: 't', mark: 'm' });
    expect(kind).toBe('bw');
    expect(svg).toContain('viewBox="0 0 420 297"');
    const hatch = /<g data-role="keyplan-hatch">([\s\S]*?)<\/g>/.exec(svg)![1]!;
    expect(hatch).toMatch(/^<rect /); // an empty g when the metrics have no entry for the kind
  });
});

// ------------------------------------------------------------------
//  Imported files = pipeline originals; only with BEECHWOOD_PIPELINE_CHECK=1 (npm run pipeline:verify).
//  Switched on without the originals it fails instead of skipping (an explicit check must not pass by looking at nothing).
//  Location: BEECHWOOD_PIPELINE_DIR, else the sibling repository **relative to this file**, the same place as
//  scripts/beechwood/pipeline.mjs pipelineDir(). It does not depend on the working directory (cwd).
// ------------------------------------------------------------------
const PIPELINE_CHECK = process.env.BEECHWOOD_PIPELINE_CHECK === '1';
const PIPE = resolve(process.env.BEECHWOOD_PIPELINE_DIR ?? fileURLToPath(new URL('../../../../beechwood-pipeline', import.meta.url)));
const MANGDO = join(PIPE, 'mangdo');
const OBJECTS = join(PIPE, 'model/out/objects.json');

describe.runIf(PIPELINE_CHECK)('imported files = pipeline originals (beechwood-pipeline)', () => {
  it('the originals exist: index, sheet folder, objects.json', () => {
    for (const p of [join(MANGDO, 'sheets_index.json'), join(MANGDO, 'sheets'), OBJECTS]) {
      expect(existsSync(p), `pipeline original missing: ${p}`).toBe(true);
    }
  });

  it('sheet folder = the svg file names of sheets_index.json, with byte-identical contents', () => {
    const index = JSON.parse(readFileSync(join(MANGDO, 'sheets_index.json'), 'utf8')) as { sheets: Array<{ svg: string }> };
    const names = index.sheets.map((s) => s.svg.split('/').pop()!);
    expect(readdirSync(pub(p.sheetsBase)).sort()).toEqual([...names].sort());
    for (const n of names) {
      expect(readFileSync(join(pub(p.sheetsBase), n)).equals(readFileSync(join(MANGDO, 'sheets', n)))).toBe(true);
    }
  });

  it('the two frame files = originals (SVG by bytes, metrics JSON by value)', () => {
    const t = p.frames.templates.bw!;
    expect(readFileSync(pub(t.svg)).equals(readFileSync(join(MANGDO, 'frame_bw.svg')))).toBe(true);
    expect(JSON.parse(readFileSync(pub(t.meta), 'utf8'))).toEqual(JSON.parse(readFileSync(join(MANGDO, 'frame_bw_meta.json'), 'utf8')));
  });

  it('manifest objects = id, name, el of objects.json', () => {
    const rows = JSON.parse(readFileSync(OBJECTS, 'utf8')) as Array<{ id: string; name: string; el: string }>;
    expect(manifest.groups[0]!.objects.map(({ id, name, el }) => ({ id, name, el }))).toEqual(
      rows.map(({ id, name, el }) => ({ id, name, el })),
    );
  });
});

// ------------------------------------------------------------------
//  Dashboard contract: the sheets of the fixture (database snapshot) resolve to sheetsBase + basename(zone_spec.svg)
// ------------------------------------------------------------------
const FIXTURE = '.fixtures/beechwood.json';

describe.runIf(existsSync(FIXTURE))('fixture sheets.zone_spec.svg to dashboard URL to public file', () => {
  it('every sheet has its sheetSvgUrl(zone_spec.svg, sheetsBase) file', () => {
    const db = JSON.parse(readFileSync(FIXTURE, 'utf8')) as { sheets: Array<{ zone_spec: { svg: string } }> };
    expect(db.sheets.length).toBeGreaterThan(0);
    for (const s of db.sheets) expect(existsSync(pub(sheetSvgUrl(s.zone_spec.svg, p.sheetsBase, '/')))).toBe(true);
  });
});
