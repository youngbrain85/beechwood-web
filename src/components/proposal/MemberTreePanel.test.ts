// ------------------------------------------------------------------
//  Member tree rows of the sheet proposal screen (renderPanelNodes): three levels and expansion by path.
//  Same approach as the 3D view tree (components/MemberTreeNodes.test.ts). Here the selection is not one key
//  but a set of ids (several nodes gathered with Ctrl), so the lit-row test is injected as isOn(ids).
// ------------------------------------------------------------------
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MantineProvider } from '@mantine/core';
import { describe, expect, it } from 'vitest';
import bwIds from '@/bridge/beechwood/__fixtures__/objects.ids.json';
import { buildTree } from '@/bridge/beechwood/tree';
import type { TreeNode } from '@/lib/glb/memberTree';
import { theme } from '@/theme';
import { MemberTreePanel, renderPanelNodes } from './MemberTreePanel';

const noop = (): void => {};
const ON_BG = 'var(--mantine-color-blue-0)';

function markup(el: ReactNode): string {
  return renderToStaticMarkup(
    createElement(MantineProvider, { theme, withCssVariables: false, withGlobalClasses: false }, el),
  ).replace(/></g, '>\n<');
}
/* Selected id set to the panel's lit-row test (every id is in the selection) */
const rows = (nodes: TreeNode[], open: string | null, selected: string[]): string => {
  const sel = new Set(selected);
  return markup(
    renderPanelNodes(nodes, open, noop, {
      isOn: (xs) => xs.length > 0 && xs.every((x) => sel.has(x)),
      pick: noop,
    }),
  );
};
const rowOf = (html: string, label: string): string | undefined => html.split('\n').find((l) => l.endsWith(`>${label}</p>`));

describe('proposal tree rows: third level and expansion by path', () => {
  const tree = buildTree(bwIds);

  it('opening Beams > Span A shows the third-level rows and lights the chosen beam row', () => {
    const html = rows(tree, 'Beams/Span A', ['BW_BEAM_A1']);
    for (const label of ['Beam 1', 'Beam 2', 'Cross-frame']) expect(rowOf(html, label), label).toBeDefined();
    expect(rowOf(html, 'Beam 1')).toContain(ON_BG);
    expect(rowOf(html, 'Beam 2')).not.toContain(ON_BG);
  });

  it('End bents > End Bent 4: wingwall C/D, bearing and pile rows', () => {
    const html = rows(tree, 'End bents/End Bent 4', []);
    for (const label of ['Cap', 'Wing C', 'Wing D', 'Bearings', 'Piles']) expect(rowOf(html, label), label).toBeDefined();
    expect(rowOf(html, 'Wing A')).toBeUndefined();
  });
});

// ------------------------------------------------------------------
//  Whole panel: the section headings come from the section trees of the bridge profile (bridge.trees).
//  This bridge has one heading (the main bridge) with a three-level tree below it.
// ------------------------------------------------------------------
const panel = (objectIds: string[]): string =>
  markup(
    createElement(MemberTreePanel, {
      objectIds,
      selected: [],
      onSelectedChange: noop,
    }),
  );

describe('panel: a single main bridge section', () => {
  it('member rows under the heading Main Bridge (7 members)', () => {
    const html = panel(bwIds);
    expect(rowOf(html, 'Main Bridge')).toBeDefined();
    expect(html).toContain('>7</p>');
    for (const m of ['Deck', 'Beams', 'Interior bents', 'Railing']) expect(rowOf(html, m), m).toBeDefined();
  });
});
