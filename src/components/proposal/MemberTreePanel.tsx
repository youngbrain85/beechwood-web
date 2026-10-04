import { useMemo, useState, type ReactNode } from 'react';
import { Button, Group, Paper, ScrollArea, Text } from '@mantine/core';
import { bridge, type SectionTree } from '@/bridge';
import type { TreeNode } from '@/lib/glb/memberTree';
import { SProposal } from '@/i18n/s.proposal';
import { isOpenPath, leafIndent, nodeIndent, nodePath, togglePath } from '@/lib/treePath';

// ------------------------------------------------------------------
//  Sheet proposals: member tree panel.
//
//  Same skeleton as the member tree of the 3D view (routes/Model.tsx): section heading, node,
//  child node. The only difference is how selection works: here several nodes are gathered
//  with Ctrl into the part shown on one sheet.
//  The section trees come from the bridge profile (bridge.trees), one PanelSection per section.
// ------------------------------------------------------------------

export interface MemberTreePanelProps {
  /* Manifest object ids; SelectViewer passes them up once the model has loaded. */
  objectIds: string[];
  selected: string[];
  onSelectedChange: (ids: string[]) => void;
}

/* Selection update for a row click: a plain click replaces, Ctrl/Cmd unions or removes. */
function nextSelection(selected: string[], ids: string[], additive: boolean): string[] {
  if (ids.length === 0) return selected;
  if (!additive) return [...new Set(ids)];
  const next = new Set(selected);
  if (ids.every((id) => next.has(id))) for (const id of ids) next.delete(id);
  else for (const id of ids) next.add(id);
  return [...next];
}

/* Selection test and click of a node row, from the selection state the panel holds. */
export interface PanelRowsCtx {
  /* Are all ids of the row in the selection (a "lit" row)? */
  isOn: (ids: string[]) => boolean;
  /* Row click; additive = Ctrl/Cmd */
  pick: (ids: string[], additive: boolean) => void;
}

/**
 * Node rows of one section: node, then child nodes (or ids); expansion is one path (lib/treePath; its ancestors expand too).
 * React keys and expansion use the node path, so labels that repeat across branches (Span A, Bearings) do not mix.
 * When a child node has children of its own (member > span/pier > part) it is drawn one level deeper as another node row.
 */
export function renderPanelNodes(
  list: TreeNode[],
  open: string | null,
  setOpen: (v: string | null) => void,
  { isOn, pick }: PanelRowsCtx,
): ReactNode[] {
  const rowBg = (on: boolean) => (on ? 'var(--mantine-color-blue-0)' : undefined);

  const leaf = (key: string, label: string, ids: string[], depth: number) => (
    <Text
      key={key}
      size="xs"
      pl={leafIndent(depth)}
      pr={12}
      py={3}
      style={{ cursor: 'pointer', background: rowBg(isOn(ids)) }}
      onClick={(e) => pick(ids, e.ctrlKey || e.metaKey)}
    >
      {label}
    </Text>
  );

  const node = (m: TreeNode, parent: string | null, depth: number): ReactNode => {
    const path = nodePath(parent, m.label);
    const opened = isOpenPath(open, path);
    return (
      <div key={path}>
        <Group
          gap={6}
          pl={nodeIndent(depth)}
          pr={12}
          py={5}
          style={{ cursor: 'pointer', background: rowBg(isOn(m.ids)) }}
          onClick={(e) => {
            pick(m.ids, e.ctrlKey || e.metaKey);
            setOpen(togglePath(open, path, parent));
          }}
        >
          <Text size="10px" c="dimmed" w={10}>
            {m.children?.length || m.ids.length > 1 ? (opened ? '▾' : '▸') : '·'}
          </Text>
          <Text size="xs" fw={600}>
            {m.label}
          </Text>
          <Text size="10px" c="dimmed" ml="auto" className="tnum">
            {m.children?.length ?? m.ids.length}
          </Text>
        </Group>
        {!opened
          ? null
          : m.children?.length
            ? m.children.map((c) =>
                c.children?.length
                  ? node(c, path, depth + 1)
                  : leaf(nodePath(path, c.label), c.label, c.ids, depth + 1),
              )
            : m.ids.length > 1
              ? m.ids.map((id) => leaf(id, id, [id], depth + 1))
              : null}
      </div>
    );
  };

  return list.map((m) => node(m, null, 1));
}

/**
 * One section tree of the bridge profile: heading (toggle, section name, node count) plus node rows. Expanded at first.
 */
function PanelSection({ tree, ctx }: { tree: SectionTree; ctx: PanelRowsCtx }) {
  const [expanded, setExpanded] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <Group
        gap={6}
        px="sm"
        py={5}
        style={{ cursor: 'pointer', borderBottom: '1px solid var(--mantine-color-gray-2)' }}
        onClick={() => setExpanded((o) => !o)}
      >
        <Text size="10px" c="dimmed" w={10}>
          {expanded ? '▾' : '▸'}
        </Text>
        <Text size="xs" fw={700}>
          {tree.label}
        </Text>
        <Text size="10px" c="dimmed" ml="auto" className="tnum">
          {tree.nodes.length}
        </Text>
      </Group>
      {expanded ? renderPanelNodes(tree.nodes, open, setOpen, ctx) : null}
    </>
  );
}

export function MemberTreePanel({ objectIds, selected, onSelectedChange }: MemberTreePanelProps) {
  // Section trees — from the bridge profile (one section: the main bridge)
  const trees = useMemo(() => bridge.trees(objectIds), [objectIds]);
  const selSet = useMemo(() => new Set(selected), [selected]);

  /* A row counts as "lit" when all of its ids are in the selection. */
  const isOn = (ids: string[]): boolean => ids.length > 0 && ids.every((id) => selSet.has(id));
  const pick = (ids: string[], additive: boolean) => onSelectedChange(nextSelection(selected, ids, additive));

  return (
    <Paper withBorder radius="sm">
      <Group gap={6} px="sm" py={6} style={{ borderBottom: '1px solid var(--mantine-color-gray-2)' }}>
        <Text size="xs" fw={700}>
          {SProposal.treeTitle}
        </Text>
        <Button
          size="compact-xs"
          variant="subtle"
          ml="auto"
          disabled={selected.length === 0}
          onClick={() => onSelectedChange([])}
        >
          {SProposal.clearSelection}
        </Button>
      </Group>

      <ScrollArea.Autosize mah={360}>
        {trees.map((t) => (
          <PanelSection key={t.section} tree={t} ctx={{ isOn, pick }} />
        ))}
      </ScrollArea.Autosize>
    </Paper>
  );
}
