// ------------------------------------------------------------------
//  Member tree paths: nodes are identified by path, not by label.
//  Labels repeat across branches (`Span A` under both Deck and Beams, `Bearings` under every bent and at the top level).
//  With the label as selection or expansion key, the same-named row of another branch would light up too, so paths must be unique.
//  The path of a top-level node is its label as is.
// ------------------------------------------------------------------
import { describe, expect, it } from 'vitest';
import ids from '@/bridge/beechwood/__fixtures__/objects.ids.json';
import { buildTree } from '@/bridge/beechwood/tree';
import type { TreeNode } from '@/lib/glb/memberTree';
import { isOpenPath, nodePath, togglePath } from './treePath';

/* Every node of the tree as [path, label], depth first */
function walk(nodes: TreeNode[], parent: string | null = null, out: Array<[string, string]> = []): Array<[string, string]> {
  for (const n of nodes) {
    const p = nodePath(parent, n.label);
    out.push([p, n.label]);
    if (n.children) walk(n.children, p, out);
  }
  return out;
}

describe('nodePath', () => {
  it('a top-level path is the label as is; a child path is parent path + / + label', () => {
    expect(nodePath(null, 'Deck')).toBe('Deck');
    expect(nodePath('Beams', 'Span A')).toBe('Beams/Span A');
    expect(nodePath('Beams/Span A', 'Beam 1')).toBe('Beams/Span A/Beam 1');
  });

  it('the bridge tree: labels repeat but every path is different', () => {
    const all = walk(buildTree(ids));
    const labels = all.map(([, l]) => l);
    const paths = all.map(([p]) => p);
    expect(new Set(labels).size).toBeLessThan(labels.length); // there really are repeated labels
    for (const dup of ['Span A', 'Bearings']) expect(labels.filter((l) => l === dup).length).toBeGreaterThan(1);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toContain('Beams/Span A/Beam 1');
    expect(paths).toContain('Interior bents/Bent 2/Bearings');
  });
});

describe('isOpenPath: the open path and its ancestors are expanded', () => {
  it('everything is closed when nothing is open', () => {
    expect(isOpenPath(null, 'Beams')).toBe(false);
  });

  it('itself and its ancestors are open; siblings, descendants and nodes sharing only a name prefix are closed', () => {
    const open = 'Beams/Span A';
    expect(isOpenPath(open, 'Beams/Span A')).toBe(true);
    expect(isOpenPath(open, 'Beams')).toBe(true);
    expect(isOpenPath(open, 'Beams/Span B')).toBe(false);
    expect(isOpenPath(open, 'Beams/Span A/Beam 1')).toBe(false);
    expect(isOpenPath(open, 'Deck')).toBe(false);
    expect(isOpenPath('Bent 22', 'Bent 2')).toBe(false); // sharing a string prefix does not make an ancestor
  });

  it('for a one-level tree it equals the test open === label', () => {
    expect(isOpenPath('Deck', 'Deck')).toBe(true);
    expect(isOpenPath('Deck', 'Beams')).toBe(false);
  });
});

describe('togglePath: opens when closed, folds to the parent when open', () => {
  it('top level: the same as setOpen(open === label ? null : label)', () => {
    expect(togglePath(null, 'Deck', null)).toBe('Deck');
    expect(togglePath('Deck', 'Deck', null)).toBe(null);
    expect(togglePath('Beams', 'Deck', null)).toBe('Deck');
  });

  it('child level: moving to a sibling keeps the parent open, and pressing again leaves only the parent', () => {
    expect(togglePath('Beams', 'Beams/Span A', 'Beams')).toBe('Beams/Span A');
    expect(togglePath('Beams/Span A', 'Beams/Span B', 'Beams')).toBe('Beams/Span B');
    expect(togglePath('Beams/Span B', 'Beams/Span B', 'Beams')).toBe('Beams');
  });

  it('pressing an ancestor of the open branch folds to that ancestor\'s parent (closes the whole branch)', () => {
    expect(togglePath('Beams/Span A', 'Beams', null)).toBe(null);
  });
});
