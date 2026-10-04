// model.mjs: unit tests of the GLB import (pipeline BEECHWOOD.glb + objects.json to public/models3d/beechwood).
// A small GLB (a few single-triangle meshes) is made in a temp folder; the real pipeline and public are untouched.
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { addModel, BW_FRAME, manifestOf } from './model.mjs';

/* One single-triangle mesh per node; node name = mesh name (the convention of the pipeline's build_beechwood) */
async function tinyGlb(path, names) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene();
  names.forEach((name, i) => {
    const pos = doc
      .createAccessor()
      .setType('VEC3')
      .setArray(new Float32Array([0, 0, i, 1, 0, i, 0, 1, i]))
      .setBuffer(buffer);
    const idx = doc.createAccessor().setType('SCALAR').setArray(new Uint16Array([0, 1, 2])).setBuffer(buffer);
    const prim = doc.createPrimitive().setAttribute('POSITION', pos).setIndices(idx);
    scene.addChild(doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim)));
  });
  await new NodeIO().write(path, doc);
}

const OBJ = (id, name = id, el = 'EL 420.00 ~ 421.00 ft') => ({
  id,
  name,
  group: 'BEECHWOOD',
  member: 'Deck',
  element_no: 12,
  quantity: 1,
  unit: 'sq ft',
  el,
  y_range_ft: [420, 421],
});

async function setup({ nodes, objects }) {
  const root = mkdtempSync(join(tmpdir(), 'bw-model-'));
  const srcGlb = join(root, 'pipeline/out/BEECHWOOD.glb');
  const srcObjects = join(root, 'pipeline/out/objects.json');
  const outDir = join(root, 'web/public/models3d/beechwood');
  mkdirSync(join(root, 'pipeline/out'), { recursive: true });
  if (nodes) await tinyGlb(srcGlb, nodes);
  if (objects) writeFileSync(srcObjects, JSON.stringify(objects, null, 1), 'utf8');
  return { srcGlb, srcObjects, outDir };
}

describe('manifestOf: the loader manifest shape (one group BEECHWOOD)', () => {
  it('version, units, frame + one group; objects hold only {id, name, el, file}', () => {
    const objects = [OBJ('BW_DECK_A', 'Deck – Span A', 'EL 426.10 ~ 432.70 ft'), OBJ('BW_JT_N', 'Joint – North', 'EL 419 ~ 420 ft')];
    expect(manifestOf(objects, 42)).toEqual({
      version: 'v1',
      units: 'm',
      frame: 'x=transverse(+right), y=(EL-400ft), z=(STA-106+21)',
      groups: [
        {
          group: 'BEECHWOOD',
          file: 'BEECHWOOD.glb',
          sizeKB: 42,
          objects: [
            { id: 'BW_DECK_A', name: 'Deck – Span A', el: 'EL 426.10 ~ 432.70 ft', file: 'BEECHWOOD.glb' },
            { id: 'BW_JT_N', name: 'Joint – North', el: 'EL 419 ~ 420 ft', file: 'BEECHWOOD.glb' },
          ],
        },
      ],
    });
    expect(BW_FRAME).toBe('x=transverse(+right), y=(EL-400ft), z=(STA-106+21)');
  });
});

describe('addModel: GLB compression + manifest.json', () => {
  it('manifest object count = objects.json row count, in the same order; the size (KB) is that of the written GLB file', async () => {
    const objects = [OBJ('BW_BEAM_A1'), OBJ('BW_DECK_A')];
    const paths = await setup({ nodes: ['BW_BEAM_A1', 'BW_DECK_A', 'BW_GROUND'], objects });

    const res = await addModel(paths);

    const manifest = JSON.parse(readFileSync(join(paths.outDir, 'manifest.json'), 'utf8'));
    expect(manifest.groups).toHaveLength(1);
    expect(manifest.groups[0].objects.length).toBe(objects.length);
    expect(manifest.groups[0].objects.map((o) => o.id)).toEqual(['BW_BEAM_A1', 'BW_DECK_A']);
    const outBytes = statSync(join(paths.outDir, 'BEECHWOOD.glb')).size;
    expect(manifest.groups[0].sizeKB).toBe(Math.round(outBytes / 1024));
    expect(res).toMatchObject({ objects: 2, outBytes, srcBytes: statSync(paths.srcGlb).size });
    expect(readdirSync(paths.outDir).sort()).toEqual(['BEECHWOOD.glb', 'manifest.json']);
  });

  it('the GLB is meshopt-compressed (EXT_meshopt_compression) and node names (= object ids) are kept', async () => {
    const paths = await setup({ nodes: ['BW_BEAM_A1', 'BW_DECK_A', 'BW_GROUND'], objects: [OBJ('BW_BEAM_A1'), OBJ('BW_DECK_A')] });
    await addModel(paths);

    const json = glbJson(readFileSync(join(paths.outDir, 'BEECHWOOD.glb')));
    expect(json.extensionsUsed).toContain('EXT_meshopt_compression');

    await MeshoptDecoder.ready;
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
    const doc = await io.read(join(paths.outDir, 'BEECHWOOD.glb'));
    const names = doc.getRoot().listNodes().filter((n) => n.getMesh()).map((n) => n.getName()).sort();
    expect(names).toEqual(['BW_BEAM_A1', 'BW_DECK_A', 'BW_GROUND']);
  });

  it('mesh nodes missing from objects.json (ground and the like) are reported as extraNodes and left out of the manifest', async () => {
    const paths = await setup({ nodes: ['BW_DECK_A', 'BW_GROUND_S', 'BW_GROUND'], objects: [OBJ('BW_DECK_A')] });
    const res = await addModel(paths);
    expect(res.extraNodes).toEqual(['BW_GROUND', 'BW_GROUND_S']);
    const manifest = JSON.parse(readFileSync(join(paths.outDir, 'manifest.json'), 'utf8'));
    expect(manifest.groups[0].objects.map((o) => o.id)).toEqual(['BW_DECK_A']);
  });

  it('fails naming the id when an id of objects.json is not a GLB node, and writes nothing', async () => {
    const paths = await setup({ nodes: ['BW_DECK_A'], objects: [OBJ('BW_DECK_A'), OBJ('BW_JT_S')] });
    await expect(addModel(paths)).rejects.toThrow(/BW_JT_S/);
    expect(existsSync(paths.outDir)).toBe(false);
  });

  it('fails with the path and the rebuild command (build_beechwood.py) when the GLB is missing', async () => {
    const paths = await setup({ objects: [OBJ('BW_DECK_A')] });
    await expect(addModel(paths)).rejects.toThrow(paths.srcGlb);
    await expect(addModel(paths)).rejects.toThrow(/build_beechwood\.py/);
    expect(existsSync(paths.outDir)).toBe(false);
  });

  it('fails when objects.json is missing or malformed (not an array, id/name/el missing)', async () => {
    const missing = await setup({ nodes: ['BW_DECK_A'] });
    await expect(addModel(missing)).rejects.toThrow(missing.srcObjects);

    const notArray = await setup({ nodes: ['BW_DECK_A'], objects: { BW_DECK_A: {} } });
    await expect(addModel(notArray)).rejects.toThrow(/objects\.json/);

    const noEl = await setup({ nodes: ['BW_DECK_A'], objects: [{ id: 'BW_DECK_A', name: 'Deck' }] });
    await expect(addModel(noEl)).rejects.toThrow(/BW_DECK_A/);
    expect(existsSync(noEl.outDir)).toBe(false);
  });
});

/* JSON chunk of the GLB container (after the 12-byte header + 8 bytes of chunk length and type) */
function glbJson(buf) {
  expect(buf.toString('ascii', 0, 4)).toBe('glTF');
  const len = buf.readUInt32LE(12);
  expect(buf.toString('ascii', 16, 20)).toBe('JSON');
  return JSON.parse(buf.toString('utf8', 20, 20 + len));
}
