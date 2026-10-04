// ------------------------------------------------------------------
//  Member tree: member > span/bent > part.
//
//    Deck ▸ Span A/B/C
//    Beams ▸ Span A/B/C ▸ Beam 1…4 + Cross-frame
//    Interior bents ▸ Bent 2 / Bent 3 ▸ Pier cap · Column 1 · Column 2 · Debris wall · Pier diaphragm · Bearings(8) · Drilled shafts
//    End bents ▸ End Bent 1 / End Bent 4 ▸ Cap · Wing A/B(C/D) · Bearings(4) · Piles(6)
//    Bearings > 24 flat (in bent order: End Bent 1, Bent 2, Bent 3, End Bent 4)
//    Railing ▸ Left / Right
//    Approach & joints ▸ South approach · North approach · South joint · North joint
//
//  The skeleton is built from the id grammar (objects.ts) and **only ids present in the input** are kept, so a
//  model without substructure ids simply loses those branches. Node ids = union of the child ids (order kept).
//  Bearings appear both under their bent branch and under the top-level Bearings: pick by bent or bearings only.
// ------------------------------------------------------------------
import type { TreeNode } from '@/lib/glb/memberTree';
import { objectInfo } from './objects';

/* Skeleton: a leaf is candidate ids, a branch is a child skeleton */
type Skeleton = { label: string; ids: string[] } | { label: string; children: Skeleton[] };

const SPANS = ['A', 'B', 'C'] as const;
const BEAM_LINES = [1, 2, 3, 4] as const;
const INTERIOR_BENTS = [2, 3] as const;
const END_BENTS = [
  { bent: 1, wings: ['A', 'B'] },
  { bent: 4, wings: ['C', 'D'] },
] as const;
const PILES = [1, 2, 3, 4, 5, 6] as const;
const ORIGIN = { x: 0, z: 0 };

const leaf = (label: string, ...ids: string[]): Skeleton => ({ label, ids });
const branch = (label: string, children: Skeleton[]): Skeleton => ({ label, children });

/* Interior bent bearings: one south (S) and one north (N) per beam line */
const interiorBearings = (bent: number): string[] =>
  BEAM_LINES.flatMap((n) => [`BW_BRG_B${bent}_${n}S`, `BW_BRG_B${bent}_${n}N`]);
/* End bent bearings: one per beam line */
const endBearings = (bent: number): string[] => BEAM_LINES.map((n) => `BW_BRG_EB${bent}_${n}`);

function skeleton(): Skeleton[] {
  const allBearings = [
    ...endBearings(1),
    ...interiorBearings(2),
    ...interiorBearings(3),
    ...endBearings(4),
  ];
  return [
    branch('Deck', SPANS.map((s) => leaf(`Span ${s}`, `BW_DECK_${s}`))),
    branch(
      'Beams',
      SPANS.map((s) =>
        branch(`Span ${s}`, [
          ...BEAM_LINES.map((n) => leaf(`Beam ${n}`, `BW_BEAM_${s}${n}`)),
          leaf('Cross-frame', `BW_XF_${s}`),
        ]),
      ),
    ),
    branch(
      'Interior bents',
      INTERIOR_BENTS.map((b) =>
        branch(`Bent ${b}`, [
          leaf('Pier cap', `BW_CAP_B${b}`),
          leaf('Column 1', `BW_COL_B${b}_1`),
          leaf('Column 2', `BW_COL_B${b}_2`),
          leaf('Debris wall', `BW_WALL_B${b}`),
          leaf('Pier diaphragm', `BW_DIA_B${b}`),
          leaf('Bearings', ...interiorBearings(b)),
          leaf('Drilled shafts', `BW_SHAFT_B${b}_1`, `BW_SHAFT_B${b}_2`),
        ]),
      ),
    ),
    branch(
      'End bents',
      END_BENTS.map(({ bent, wings }) =>
        branch(`End Bent ${bent}`, [
          leaf('Cap', `BW_EB${bent}_CAP`),
          ...wings.map((w) => leaf(`Wing ${w}`, `BW_EB${bent}_WING_${w}`)),
          leaf('Bearings', ...endBearings(bent)),
          leaf('Piles', ...PILES.map((k) => `BW_PILE_EB${bent}_${k}`)),
        ]),
      ),
    ),
    // Label = location text (objectInfo), the same words as the 3D info panel
    branch('Bearings', allBearings.map((id) => leaf(objectInfo('', id, ORIGIN).locationDetail, id))),
    branch('Railing', [leaf('Left', 'BW_RAIL_L'), leaf('Right', 'BW_RAIL_R')]),
    branch('Approach & joints', [
      leaf('South approach', 'BW_APPR_S'),
      leaf('North approach', 'BW_APPR_N'),
      leaf('South joint', 'BW_JT_S'),
      leaf('North joint', 'BW_JT_N'),
    ]),
  ];
}

/* Skeleton to nodes holding only ids present in the input (null when empty) */
function prune(s: Skeleton, has: (id: string) => boolean): TreeNode | null {
  if ('ids' in s) {
    const ids = s.ids.filter(has);
    return ids.length > 0 ? { label: s.label, ids } : null;
  }
  const children = s.children.map((c) => prune(c, has)).filter((c): c is TreeNode => c !== null);
  if (children.length === 0) return null;
  return { label: s.label, ids: [...new Set(children.flatMap((c) => c.ids))], children };
}

/* Model object id list to the member tree */
export function buildTree(objectIds: string[]): TreeNode[] {
  const idSet = new Set(objectIds);
  const has = (id: string) => idSet.has(id);
  return skeleton()
    .map((s) => prune(s, has))
    .filter((n): n is TreeNode => n !== null);
}
