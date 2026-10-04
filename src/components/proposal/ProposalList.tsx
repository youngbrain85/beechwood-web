import { Badge, Box, Button, Group, Paper, ScrollArea, Text, UnstyledButton } from '@mantine/core';
import { formatDate } from '@/lib/format';
import type { ProposalSpec } from '@/lib/proposal/engine';
import type { SheetProposalRow } from '@/types/db';
import { COMPOSITION_NAME, SProposal } from '@/i18n/s.proposal';

// ------------------------------------------------------------------
//  Sheet proposals: saved proposal list (collapsible, collapsed by default).
//
//  Clicking a row makes the page read that proposal's drawing fragment (fetchProposalDrawing) and
//  show it **read-only** in the same preview area. Discarding does not delete the row; it only
//  changes status, which takes the row out of the title uniqueness check.
// ------------------------------------------------------------------

/* The stored composition is a string; a value missing from the table is shown as stored. */
const compositionName = (key: string): string =>
  (COMPOSITION_NAME as Record<string, string | undefined>)[key] ?? key;

/**
 * Paper and scale shown on a row, e.g. `A1 1:500`.
 * The paper is `spec.layout.paper` when present, else decided by the canvas width (over 500 mm = A1).
 * A stored spec is outside data, so when nothing can be read the cell is empty (null).
 */
export function paperScale(spec: ProposalSpec): string | null {
  // A jsonb not null column still accepts JSON null; a spec that is not an object has nothing to read.
  const s = (typeof spec === 'object' && spec !== null ? spec : {}) as {
    canvas_mm?: unknown;
    layout?: unknown;
  };
  const layout = (typeof s.layout === 'object' && s.layout !== null ? s.layout : {}) as {
    scale?: unknown;
    paper?: unknown;
  };
  const scale = typeof layout.scale === 'string' ? layout.scale : null;
  const canvasW =
    Array.isArray(s.canvas_mm) && typeof s.canvas_mm[0] === 'number' ? s.canvas_mm[0] : null;
  const paper =
    layout.paper === 'A1' || layout.paper === 'A3'
      ? layout.paper
      : canvasW === null
        ? null
        : canvasW > 500
          ? 'A1'
          : 'A3';

  const parts = [paper, scale].filter((p): p is string => typeof p === 'string' && p.length > 0);
  return parts.length > 0 ? parts.join(' ') : null;
}

/* An empty or unparsable created_at drops the date cell altogether (no `NaN-NaN-NaN`). */
function createdAt(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : formatDate(d);
}

export interface ProposalListProps {
  rows: SheetProposalRow[];
  loading: boolean;
  error: Error | null;
  /* false = the table does not exist yet (before the migration) */
  available: boolean;
  open: boolean;
  onToggle: () => void;
  openId: string | null;
  onOpen: (row: SheetProposalRow) => void;
  onDiscard: (row: SheetProposalRow) => void;
  /* Row being discarded */
  busyId?: string | null;
}

export function ProposalList({
  rows,
  loading,
  error,
  available,
  open,
  onToggle,
  openId,
  onOpen,
  onDiscard,
  busyId,
}: ProposalListProps) {
  return (
    <Paper withBorder radius="sm" mt={12}>
      <Group
        gap={6}
        px="sm"
        py={6}
        style={{ cursor: 'pointer', borderBottom: open ? '1px solid var(--mantine-color-gray-2)' : undefined }}
        onClick={onToggle}
      >
        <Text size="10px" c="dimmed" w={10}>
          {open ? '▾' : '▸'}
        </Text>
        <Text size="xs" fw={700}>
          {SProposal.listTitle}
        </Text>
        <Text size="10px" c="dimmed" ml="auto" className="tnum">
          {rows.length}
        </Text>
      </Group>

      {!open ? null : !available ? (
        <Text size="10px" c="dimmed" px="sm" py={10}>
          {SProposal.saveUnavailable}
        </Text>
      ) : loading ? (
        <Text size="10px" c="dimmed" px="sm" py={10}>
          {SProposal.listLoading}
        </Text>
      ) : error ? (
        <Text size="10px" c="#9B1C1C" px="sm" py={10}>
          {SProposal.listError(error.message)}
        </Text>
      ) : rows.length === 0 ? (
        <Text size="10px" c="dimmed" px="sm" py={10}>
          {SProposal.listEmpty}
        </Text>
      ) : (
        <ScrollArea.Autosize mah={280}>
          {rows.map((row) => {
            const discarded = row.status === 'discarded';
            const when = createdAt(row.created_at);
            const sheet = paperScale(row.spec);
            return (
              <Group
                key={row.id}
                gap={8}
                wrap="nowrap"
                px="sm"
                py={6}
                style={{
                  borderTop: '1px solid var(--mantine-color-gray-1)',
                  background: row.id === openId ? 'var(--mantine-color-blue-0)' : undefined,
                  opacity: discarded ? 0.55 : 1,
                }}
              >
                <UnstyledButton
                  onClick={() => onOpen(row)}
                  style={{ flex: 1, minWidth: 0, textAlign: 'left' }}
                >
                  <Text size="xs" fw={600} truncate>
                    {row.title}
                  </Text>
                  <Text size="10px" c="dimmed" className="tnum" truncate>
                    {compositionName(row.composition)}
                    {sheet ? ` · ${sheet}` : ''}
                    {when ? ` · ${when}` : ''}
                  </Text>
                </UnstyledButton>
                <Badge
                  size="xs"
                  variant="outline"
                  style={{ textTransform: 'none', fontWeight: 600, flexShrink: 0 }}
                  color={discarded ? 'gray' : 'blue'}
                >
                  {discarded ? SProposal.statusDiscarded : SProposal.statusProposed}
                </Badge>
                <Box style={{ flexShrink: 0, width: 46 }}>
                  {discarded ? null : (
                    <Button
                      size="compact-xs"
                      variant="subtle"
                      color="gray"
                      loading={busyId === row.id}
                      onClick={() => onDiscard(row)}
                    >
                      {SProposal.discard}
                    </Button>
                  )}
                </Box>
              </Group>
            );
          })}
        </ScrollArea.Autosize>
      )}
    </Paper>
  );
}
