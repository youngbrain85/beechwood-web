// ------------------------------------------------------------------
//  Member tree rows of the 3D view (renderMemberNodes): three levels and path keys.
//
//  The tests render the rows to static markup and read the result. React keys and click
//  handlers do not appear in markup, so those rules are covered by lib/treePath.test.ts.
// ------------------------------------------------------------------
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MantineProvider } from '@mantine/core';
import { describe, expect, it } from 'vitest';
import bwIds from '@/bridge/beechwood/__fixtures__/objects.ids.json';
import { buildTree } from '@/bridge/beechwood/tree';
import type { TreeNode } from '@/lib/glb/memberTree';
import { theme } from '@/theme';
import { renderMemberNodes, SectionTreeRows } from './MemberTreeNodes';

const noop = (): void => {};
const SELECTED_BG = 'var(--mantine-color-gray-2)';

/* Server-rendered markup, broken into lines only at tag boundaries so it reads easily (deterministic). */
function markup(el: ReactNode): string {
  return renderToStaticMarkup(
    createElement(MantineProvider, { theme, withCssVariables: false, withGlobalClasses: false }, el),
  ).replace(/></g, '>\n<');
}
const rows = (nodes: TreeNode[], open: string | null, selected: string | null): string =>
  markup(renderMemberNodes(nodes, open, noop, selected, noop));

/* Finds one row of the markup by its literal text (one label row = one tag). */
const rowOf = (html: string, label: string): string | undefined => html.split('\n').find((l) => l.endsWith(`>${label}</p>`));

describe('3D tree rows: third level and path keys', () => {
  const tree = buildTree(bwIds);

  it('expands by path: opening Beams > Span A shows the third level (Beam 1..4, Cross-frame)', () => {
    const html = rows(tree, 'Beams/Span A', null);
    for (const label of ['Span A', 'Span B', 'Beam 1', 'Beam 4', 'Cross-frame']) expect(rowOf(html, label), label).toBeDefined();
    // The same-named Deck > Span A stays hidden because Deck is closed, so there is exactly one Span A row
    expect(html.split('\n').filter((l) => l.endsWith('>Span A</p>'))).toHaveLength(1);
  });

  it('indents third-level rows deeper than second-level rows', () => {
    const html = rows(tree, 'Beams/Span A', null);
    const indent = (label: string): number => {
      const i = html.split('\n').findIndex((l) => l.endsWith(`>${label}</p>`));
      // A row's indent is the padding-left of the row itself or of the Group wrapping it
      const around = html.split('\n').slice(Math.max(0, i - 3), i + 1).join('');
      const m = /padding-left:calc\(([\d.]+)rem/.exec(around.slice(around.lastIndexOf('padding-left')));
      return m ? Number(m[1]) : NaN;
    };
    expect(indent('Beam 1')).toBeGreaterThan(indent('Span B'));
  });

  it('highlights exactly one path: choosing Bearings under a pier does not light the top-level Bearings row', () => {
    const html = rows(tree, 'Interior bents/Bent 2', 'Interior bents/Bent 2/Bearings');
    expect(html.split(SELECTED_BG).length - 1).toBe(1);
    expect(rowOf(html, 'Bearings')).toBeDefined();
  });
});

describe('section tree (SectionTreeRows): section heading plus node rows', () => {
  it('main bridge: shows the heading (section name, node count) and the seven member rows expanded from the start', () => {
    const tree = { section: 'main', label: 'Main Bridge', nodes: buildTree(bwIds) };
    const html = markup(createElement(SectionTreeRows, { tree, selectedKey: null, onSelect: noop }));
    expect(rowOf(html, 'Main Bridge')).toBeDefined();
    expect(html).toContain('>▾</p>');
    expect(html).toContain('>7</p>');
    for (const m of ['Deck', 'Beams', 'Interior bents', 'End bents', 'Bearings', 'Railing', 'Approach & joints']) {
      expect(rowOf(html, m.replace('&', '&amp;')), m).toBeDefined();
    }
  });
});
