// Member tree: member > span/bent > part. Only what is in the input ids appears.
import { describe, expect, it } from 'vitest';
import type { TreeNode } from '@/lib/glb/memberTree';
import ids from './__fixtures__/objects.ids.json';
import { BW_MEMBERS, objectInfo } from './objects';
import { buildTree } from './tree';

const tree = buildTree(ids);
const top = (label: string): TreeNode => {
  const n = tree.find((t) => t.label === label);
  if (!n) throw new Error(`top-level node missing: ${label}`);
  return n;
};
const child = (n: TreeNode, label: string): TreeNode => {
  const c = n.children?.find((x) => x.label === label);
  if (!c) throw new Error(`child node missing: ${n.label} > ${label}`);
  return c;
};
const labels = (n: TreeNode): string[] => (n.children ?? []).map((c) => c.label);
const leaf = (label: string, ...leafIds: string[]) => ({ label, ids: leafIds });

/* Every node (any depth) */
function walk(nodes: TreeNode[], out: TreeNode[] = []): TreeNode[] {
  for (const n of nodes) {
    out.push(n);
    if (n.children) walk(n.children, out);
  }
  return out;
}

describe('member tree: the 80 model ids', () => {
  it('top level = the seven members in the fixed order, named like memberName of objectInfo', () => {
    expect(tree.map((n) => n.label)).toEqual([
      'Deck',
      'Beams',
      'Interior bents',
      'End bents',
      'Bearings',
      'Railing',
      'Approach & joints',
    ]);
    expect(tree.map((n) => n.label)).toEqual([...BW_MEMBERS]);
  });

  it('a member branch = all objects of that member (memberName); only bent branches also carry their bearings', () => {
    const memberOf = (id: string) => objectInfo('BEECHWOOD', id, { x: 0, z: 0 }).memberName;
    for (const n of tree) {
      const own = ids.filter((id) => memberOf(id) === n.label);
      const extra = n.ids.filter((id) => memberOf(id) !== n.label);
      expect(n.ids).toEqual(expect.arrayContaining(own));
      expect(extra.every((id) => memberOf(id) === 'Bearings' && n.label.endsWith('bents'))).toBe(true);
    }
  });

  it('Deck ▸ Span A/B/C', () => {
    expect(top('Deck')).toEqual({
      label: 'Deck',
      ids: ['BW_DECK_A', 'BW_DECK_B', 'BW_DECK_C'],
      children: [leaf('Span A', 'BW_DECK_A'), leaf('Span B', 'BW_DECK_B'), leaf('Span C', 'BW_DECK_C')],
    });
  });

  it('Beams ▸ Span A/B/C ▸ Beam 1…4 + Cross-frame', () => {
    const beams = top('Beams');
    expect(labels(beams)).toEqual(['Span A', 'Span B', 'Span C']);
    expect(child(beams, 'Span B')).toEqual({
      label: 'Span B',
      ids: ['BW_BEAM_B1', 'BW_BEAM_B2', 'BW_BEAM_B3', 'BW_BEAM_B4', 'BW_XF_B'],
      children: [
        leaf('Beam 1', 'BW_BEAM_B1'),
        leaf('Beam 2', 'BW_BEAM_B2'),
        leaf('Beam 3', 'BW_BEAM_B3'),
        leaf('Beam 4', 'BW_BEAM_B4'),
        leaf('Cross-frame', 'BW_XF_B'),
      ],
    });
    expect(beams.ids).toHaveLength(15);
    // Three levels: grandchild nodes read directly as TreeNode too (TreeNode.children is recursive)
    const spanA = beams.children?.[0];
    expect(spanA?.children?.map((c) => c.label)).toEqual(['Beam 1', 'Beam 2', 'Beam 3', 'Beam 4', 'Cross-frame']);
  });

  it('Interior bents ▸ Bent 2 / Bent 3 ▸ cap · columns · wall · diaphragm · bearings(8) · shafts', () => {
    const ib = top('Interior bents');
    expect(labels(ib)).toEqual(['Bent 2', 'Bent 3']);
    expect(child(ib, 'Bent 2').children).toEqual([
      leaf('Pier cap', 'BW_CAP_B2'),
      leaf('Column 1', 'BW_COL_B2_1'),
      leaf('Column 2', 'BW_COL_B2_2'),
      leaf('Debris wall', 'BW_WALL_B2'),
      leaf('Pier diaphragm', 'BW_DIA_B2'),
      leaf(
        'Bearings',
        'BW_BRG_B2_1S',
        'BW_BRG_B2_1N',
        'BW_BRG_B2_2S',
        'BW_BRG_B2_2N',
        'BW_BRG_B2_3S',
        'BW_BRG_B2_3N',
        'BW_BRG_B2_4S',
        'BW_BRG_B2_4N',
      ),
      leaf('Drilled shafts', 'BW_SHAFT_B2_1', 'BW_SHAFT_B2_2'),
    ]);
    expect(child(ib, 'Bent 3').ids).toHaveLength(15);
  });

  it('End bents ▸ End Bent 1 / End Bent 4 ▸ cap · wings · bearings(4) · piles(6)', () => {
    const eb = top('End bents');
    expect(labels(eb)).toEqual(['End Bent 1', 'End Bent 4']);
    expect(labels(child(eb, 'End Bent 1'))).toEqual(['Cap', 'Wing A', 'Wing B', 'Bearings', 'Piles']);
    const eb4 = child(eb, 'End Bent 4');
    expect(eb4.children).toEqual([
      leaf('Cap', 'BW_EB4_CAP'),
      leaf('Wing C', 'BW_EB4_WING_C'),
      leaf('Wing D', 'BW_EB4_WING_D'),
      leaf('Bearings', 'BW_BRG_EB4_1', 'BW_BRG_EB4_2', 'BW_BRG_EB4_3', 'BW_BRG_EB4_4'),
      leaf('Piles', 'BW_PILE_EB4_1', 'BW_PILE_EB4_2', 'BW_PILE_EB4_3', 'BW_PILE_EB4_4', 'BW_PILE_EB4_5', 'BW_PILE_EB4_6'),
    ]);
    expect(eb.ids).toHaveLength(26);
  });

  it('Bearings: 24 flat, in bent order (End Bent 1, Bent 2, Bent 3, End Bent 4), label = location', () => {
    const brg = top('Bearings');
    const expectedIds = [
      ...[1, 2, 3, 4].map((n) => `BW_BRG_EB1_${n}`),
      ...[1, 2, 3, 4].flatMap((n) => [`BW_BRG_B2_${n}S`, `BW_BRG_B2_${n}N`]),
      ...[1, 2, 3, 4].flatMap((n) => [`BW_BRG_B3_${n}S`, `BW_BRG_B3_${n}N`]),
      ...[1, 2, 3, 4].map((n) => `BW_BRG_EB4_${n}`),
    ];
    expect(brg.ids).toEqual(expectedIds);
    expect(brg.children).toEqual(
      expectedIds.map((id) => leaf(objectInfo('BEECHWOOD', id, { x: 0, z: 0 }).locationDetail, id)),
    );
    expect(brg.children?.[0]?.label).toBe('End Bent 1, beam line 1');
    expect(brg.children?.[5]?.label).toBe('Bent 2, beam line 1, north');
  });

  it('Railing: Left / Right; Approach & joints: south and north approach slabs, south and north expansion joints', () => {
    expect(top('Railing')).toEqual({
      label: 'Railing',
      ids: ['BW_RAIL_L', 'BW_RAIL_R'],
      children: [leaf('Left', 'BW_RAIL_L'), leaf('Right', 'BW_RAIL_R')],
    });
    expect(top('Approach & joints')).toEqual({
      label: 'Approach & joints',
      ids: ['BW_APPR_S', 'BW_APPR_N', 'BW_JT_S', 'BW_JT_N'],
      children: [
        leaf('South approach', 'BW_APPR_S'),
        leaf('North approach', 'BW_APPR_N'),
        leaf('South joint', 'BW_JT_S'),
        leaf('North joint', 'BW_JT_N'),
      ],
    });
  });

  it('every id is somewhere in the tree: the union of top-level ids = all 80', () => {
    expect(new Set(tree.flatMap((n) => n.ids))).toEqual(new Set(ids));
  });

  it('node ids = union of the child node ids (order kept), and no empty nodes', () => {
    for (const n of walk(tree)) {
      expect(n.ids.length).toBeGreaterThan(0);
      if (n.children) expect(n.ids).toEqual([...new Set(n.children.flatMap((c) => c.ids))]);
    }
  });

  it('does not depend on the input order', () => {
    expect(buildTree([...ids].reverse())).toEqual(tree);
  });
});

describe('member tree: only what is in the input (filter)', () => {
  it('given some ids, only branches holding those ids remain', () => {
    expect(buildTree(['BW_DECK_B', 'BW_BEAM_A1'])).toEqual([
      { label: 'Deck', ids: ['BW_DECK_B'], children: [leaf('Span B', 'BW_DECK_B')] },
      {
        label: 'Beams',
        ids: ['BW_BEAM_A1'],
        children: [{ label: 'Span A', ids: ['BW_BEAM_A1'], children: [leaf('Beam 1', 'BW_BEAM_A1')] }],
      },
    ]);
  });

  it('works for a superstructure-only model (before substructure ids are added): bent branches hold diaphragms only', () => {
    const superOnly = ids.filter((id) => /^BW_(DECK|BEAM|XF|DIA|RAIL|APPR|JT)_/.test(id));
    const t = buildTree(superOnly);
    expect(t.map((n) => n.label)).toEqual(['Deck', 'Beams', 'Interior bents', 'Railing', 'Approach & joints']);
    expect(t[2]).toEqual({
      label: 'Interior bents',
      ids: ['BW_DIA_B2', 'BW_DIA_B3'],
      children: [
        { label: 'Bent 2', ids: ['BW_DIA_B2'], children: [leaf('Pier diaphragm', 'BW_DIA_B2')] },
        { label: 'Bent 3', ids: ['BW_DIA_B3'], children: [leaf('Pier diaphragm', 'BW_DIA_B3')] },
      ],
    });
  });

  it('an empty tree without any known id: unknown ids, ground and ids of another model are ignored', () => {
    expect(buildTree([])).toEqual([]);
    expect(buildTree(['BW_GROUND', 'BW_FOO_1', 'X_1', 'OTHER'])).toEqual([]);
  });
});
