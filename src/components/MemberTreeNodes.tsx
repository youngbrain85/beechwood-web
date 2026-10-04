import { useState, type ReactNode } from 'react';
import { Group, Text } from '@mantine/core';
import type { SectionTree } from '@/bridge';
import type { TreeNode } from '@/lib/glb/memberTree';
import { isOpenPath, leafIndent, nodeIndent, nodePath, togglePath } from '@/lib/treePath';

// ------------------------------------------------------------------
//  Node rows of the member tree in the 3D view (routes/Model.tsx): the list under a section heading.
//
//  The selection key, the expansion state and the React key are the node **path** (lib/treePath, e.g.
//  `Beams/Span A/Beam 1`). Labels repeat across branches (Span A, Bearings), so keying by label would
//  light up the same-named row of another branch. A top-level path equals its label, and an id row is
//  keyed by the id itself. When a child node has children of its own (member > span/pier > part)
//  it is drawn one level deeper as another node row.
// ------------------------------------------------------------------

type SetOpen = (v: string | null) => void;
type OnSelect = (key: string | null, ids: string[] | null) => void;

/**
 * Renders the member nodes under a section.
 * open = one expanded path (its ancestors count as expanded too), selectedKey = path (or id) of the chosen row.
 */
export function renderMemberNodes(
  nodes: TreeNode[],
  open: string | null,
  setOpen: SetOpen,
  selectedKey: string | null,
  onSelect: OnSelect,
): ReactNode[] {
  return nodes.map((m) => renderNode(m, null, 1, open, setOpen, selectedKey, onSelect));
}

/**
 * One section tree of the bridge profile: heading (toggle, section name, node count) plus node rows.
 * Expanded at first. For sections that carry nothing but a tree (no visibility checkbox, no lazy
 * loading), such as the main bridge.
 */
export function SectionTreeRows({
  tree,
  selectedKey,
  onSelect,
}: {
  tree: SectionTree;
  selectedKey: string | null;
  onSelect: OnSelect;
}) {
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
      {expanded ? renderMemberNodes(tree.nodes, open, setOpen, selectedKey, onSelect) : null}
    </>
  );
}

function renderNode(
  m: TreeNode,
  parent: string | null,
  depth: number,
  open: string | null,
  setOpen: SetOpen,
  selectedKey: string | null,
  onSelect: OnSelect,
): ReactNode {
  const path = nodePath(parent, m.label);
  const opened = isOpenPath(open, path);
  return (
    <div key={path}>
      <Group
        gap={6}
        pl={nodeIndent(depth)}
        pr={12}
        py={5}
        style={{
          cursor: 'pointer',
          background: selectedKey === path ? 'var(--mantine-color-gray-2)' : undefined,
        }}
        onClick={() => {
          onSelect(path, m.ids);
          setOpen(togglePath(open, path, parent));
        }}
      >
        <Text size="10px" c="dimmed" w={10}>
          {m.children?.length || m.ids.length > 1
            ? opened
              ? '▾'
              : '▸'
            : '·'}
        </Text>
        <Text size="xs" fw={600}>
          {m.label}
        </Text>
        <Text size="10px" c="dimmed" ml="auto" className="tnum">
          {m.children?.length ?? m.ids.length}
        </Text>
      </Group>
      {!opened ? null : m.children?.length ? (
        // Child members: shown by label and selected by their id list.
        // If a child has children of its own, it becomes another node row one level deeper.
        m.children.map((c) => {
          if (c.children?.length) return renderNode(c, path, depth + 1, open, setOpen, selectedKey, onSelect);
          const childPath = nodePath(path, c.label);
          return (
            <Text
              key={childPath}
              size="xs"
              pl={leafIndent(depth + 1)}
              py={3}
              style={{
                cursor: 'pointer',
                background:
                  selectedKey === childPath
                    ? 'var(--mantine-color-gray-2)'
                    : undefined,
              }}
              onClick={() => onSelect(childPath, c.ids)}
            >
              {c.label}
            </Text>
          );
        })
      ) : m.ids.length > 1 ? (
        m.ids.map((id) => (
          <Text
            key={id}
            size="xs"
            pl={leafIndent(depth + 1)}
            py={3}
            style={{
              cursor: 'pointer',
              background: selectedKey === id ? 'var(--mantine-color-gray-2)' : undefined,
            }}
            onClick={() => onSelect(id, [id])}
          >
            {id}
          </Text>
        ))
      ) : null}
    </div>
  );
}
