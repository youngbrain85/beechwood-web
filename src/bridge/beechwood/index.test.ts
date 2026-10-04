// Bridge profile: the assembled result (model path, sheets, sections, labels, frames, texts) and the "English only" invariant.
import { describe, expect, it } from 'vitest';
import { NO_CLIP } from '@/lib/proposal/types';
import type { BridgeProfile } from '../types';
import ids from './__fixtures__/objects.ids.json';
import { beechwoodProfile } from './index';
import { objectInfo } from './objects';
import { clipLabels, elLabel, staLabel, xLabel } from './sta';
import { buildTree } from './tree';

const HANGUL = /[\uAC00-\uD7A3\u3131-\u314E\u314F-\u3163]/;
const p: BridgeProfile = beechwoodProfile;

/* Every string inside a value (functions are skipped) */
function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) for (const x of v) strings(x, out);
  else if (v && typeof v === 'object') for (const x of Object.values(v)) strings(x, out);
  return out;
}

describe('profile: fixed values', () => {
  it('identity and names', () => {
    expect(p.code).toBe('beechwood');
    expect(p.name).toBe('Beechwood Bridge');
    expect(p.texts.bridgeName).toBe('Beechwood Bridge');
  });

  it('model manifest and sheet paths: dedicated folders', () => {
    expect(p.model).toEqual({ manifestUrl: '/models3d/beechwood/manifest.json' });
    expect(p.sheetsBase).toBe('/sheets-beechwood/');
  });

  it('one evaluation section (Main Bridge), which is also the default section', () => {
    expect(p.sections).toEqual([{ code: 'main', name: 'Main Bridge' }]);
    expect(p.defaultSectionCode).toBe('main');
    expect(p.texts.sectionNames).toEqual({ main: 'Main Bridge' });
    expect(Object.keys(p.texts.sectionNames)).toEqual(p.sections.map((s) => s.code));
  });

  it('frames: the single kind bw for any range, with its template file', () => {
    expect(p.frames.kindFor({ min: [0, 0, -40], max: [0, 0, -30] })).toBe('bw');
    expect(p.frames.kindFor({ min: [-5, -3, -200], max: [5, 10, 200] })).toBe('bw');
    expect(p.frames.templates).toEqual({
      bw: { svg: '/proposal/frame_bw.svg', meta: '/proposal/frame_bw_meta.json' },
    });
  });
});

describe('profile: module delegation', () => {
  it('objectInfo, buildTree and the STA/EL labels are those of the bridge modules', () => {
    expect(p.objectInfo).toBe(objectInfo);
    expect(p.buildTree).toBe(buildTree);
    expect(p.sta.label).toBe(staLabel);
    expect(p.sta.el).toBe(elLabel);
    expect(p.sta.x).toBe(xLabel);
    expect(p.sta.clipLabels).toBe(clipLabels);
  });

  it('behaviour check, once each', () => {
    expect(p.objectInfo('BEECHWOOD', 'BW_DECK_A', { x: 0, z: 0 }).memberName).toBe('Deck');
    expect(p.buildTree(ids).map((n) => n.label)[0]).toBe('Deck');
    expect(p.sta.label(0)).toBe('STA 106+21.0');
    expect(p.sta.el(0)).toBe('EL 400.0 ft');
    expect(p.sta.clipLabels(NO_CLIP)).toEqual([]);
  });
});

describe('profile: English only (no Hangul)', () => {
  it('fixed profile strings', () => {
    const all = strings(p);
    expect(all.length).toBeGreaterThan(5);
    expect(all.filter((s) => HANGUL.test(s))).toEqual([]);
  });

  it('member info, tree labels and position labels of the 80 model ids + ground', () => {
    const out: string[] = [];
    for (const id of [...ids, 'BW_GROUND', 'BW_FOO']) strings(p.objectInfo('BEECHWOOD', id, { x: 0, z: 0 }), out);
    strings(p.buildTree(ids), out);
    out.push(p.sta.label(-38.1), p.sta.el(8.66), ...p.sta.clipLabels({ x: [-1, 1], y: [2, 3], z: [-5, 5] }));
    expect(out.filter((s) => HANGUL.test(s))).toEqual([]);
  });
});

// ------------------------------------------------------------------
//  Fields the screens and the engine read through the profile.
// ------------------------------------------------------------------
describe('profile: stored bridge name, section trees, proposal rules', () => {
  it('stored bridge name = the formal name of the pipeline sheets_index.json / database bridges.name (separate from the display name)', () => {
    expect(p.storedName).toBe('Beechwood Rd over Little Blue River');
    expect(p.proposal.storedName).toBe(p.storedName);
    expect(p.name).toBe('Beechwood Bridge');
  });

  it('section trees: one main bridge section, labelled with the section display name, nodes straight from buildTree', () => {
    expect(p.trees(ids)).toEqual([{ section: 'main', label: 'Main Bridge', nodes: buildTree(ids) }]);
    expect(p.trees([])).toEqual([{ section: 'main', label: 'Main Bridge', nodes: [] }]);
  });

  it('proposal rules: composition names, default fine member Other, STA/EL labels', () => {
    expect(p.proposal.fallbackFine).toBe('Other');
    expect(p.proposal.compositionNames.development).toBe('Face-by-Face Development');
    expect(p.proposal.title.clipLabels).toBe(clipLabels);
  });
});

// ------------------------------------------------------------------
//  Fields read by the AASHTO screens, the damage form and sheet proposals.
// ------------------------------------------------------------------
describe('profile: round label, sheet families, proposal view labels', () => {
  it('default round label = the seeded inspection round 2026-09 (database inspections.round_label)', () => {
    expect(p.roundLabel).toBe('2026-09');
  });

  it('bridge subtitle: formal name and location (INDOT Des. No. 1400825)', () => {
    expect(p.texts.bridgeSub).toBe('Beechwood Rd over Little Blue River · Crawford County, Indiana');
  });

  it('sheet family display names are the stored names as is', () => {
    for (const f of ['Deck', 'Beams', 'Interior bents', 'End bents', 'Bearings', 'Railing', 'Approach & joints']) {
      expect(p.texts.familyName(f)).toBe(f);
    }
  });

  it('fine member to the sheet families that draw it (the same groups as the per-sheet object lists of the pipeline sheets_index)', () => {
    const f = (fine: string, name = 'X'): string[] => p.familiesFor([{ name, fine }]);
    expect(f('Deck slab')).toEqual(['Deck']);
    expect(f('PSC bulb-tee beam')).toEqual(['Beams']);
    expect(f('Steel cross-frame')).toEqual(['Beams']);
    expect(f('Pier diaphragm')).toEqual(['Beams', 'Interior bents']);
    expect(f('Pier cap')).toEqual(['Interior bents']);
    expect(f('Column')).toEqual(['Interior bents']);
    expect(f('Debris wall')).toEqual(['Interior bents']);
    // End bent caps are also drawn on beam sheets (BW-BEAM-*-EXT/INT/SOF) as bearing seats (like the pier diaphragms)
    expect(f('Integral end bent cap')).toEqual(['Beams', 'End bents']);
    expect(f('Wing wall')).toEqual(['End bents']);
    expect(f('Elastomeric bearing')).toEqual(['Bearings']);
    expect(f('Concrete barrier rail (Type FC)')).toEqual(['Railing']);
    expect(f('Approach slab')).toEqual(['Approach & joints']);
    expect(f('Expansion joint')).toEqual(['Bearings', 'Approach & joints']);
    // Drilled shaft stubs are main objects of the interior bent sheets (BW-BENT-2/3)
    expect(f('Drilled shaft (stub)')).toEqual(['Interior bents']);
    // Buried and not drawn on any sheet (H-piles, end bent sheet note "buried"), ground, and ids outside the grammar
    expect(f('Steel H-pile (stub)')).toEqual([]);
    expect(f('Ground')).toEqual([]);
    expect(f('Other')).toEqual([]);
  });

  it('several meshes: no duplicates, in member tree order (Deck ... Approach & joints)', () => {
    const got = p.familiesFor([
      { name: 'BW_JT_S', fine: 'Expansion joint' },
      { name: 'BW_DECK_B', fine: 'Deck slab' },
      { name: 'BW_BRG_B2_1S', fine: 'Elastomeric bearing' },
    ]);
    expect(got).toEqual(['Deck', 'Bearings', 'Approach & joints']);
    expect(p.familiesFor([])).toEqual([]);
  });

  it('proposal view labels follow the bridge orientation (-z south, +z north, -x west, +x east)', () => {
    const L = p.proposal.viewLabels;
    expect(L.axes).toEqual(['Top', 'Soffit', 'West face', 'East face', 'South face', 'North face']);
    expect(L.cylinder).toEqual(['Front face', 'East face', 'Back face', 'West face']);
    expect(L.quadrants).toEqual(['Quadrant 1', 'Quadrant 2', 'Quadrant 3', 'Quadrant 4']);
    expect(L.oblique(3)).toBe('Inclined face 3');
    const all = [...L.axes, ...L.cylinder, ...L.quadrants, L.oblique(1)];
    expect(all.filter((s) => HANGUL.test(s))).toEqual([]);
  });
});
