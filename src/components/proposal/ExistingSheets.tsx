import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Group, Paper, Text } from '@mantine/core';
import { clipMeshes } from '@/lib/proposal/clip';
import type { Covering } from '@/lib/proposal/existing';
import { existingSheetsFromRows, findCoveringSheets } from '@/lib/proposal/existing';
import { bridge } from '@/bridge';
import type { ClipBox, MeshInput } from '@/lib/proposal/types';
import { SProposal } from '@/i18n/s.proposal';

// ------------------------------------------------------------------
//  Sheet proposals: the "existing sheets that already show this part" hint (approximate).
//
//  The source is the database sheets rows: only they carry the view planes and the **per-view clip boxes**.
//  Only sheets whose member family matches the selected meshes (bridge profile familiesFor: the
//  seven member kinds) are examined, and the covered share is measured by face area.
//  Runs only when the selection changes; the work is small enough for one pass on the main thread.
//  Draws nothing when there are no results.
// ------------------------------------------------------------------

/**
 * Existing sheets that show the selected part (approximate). Recounted only when the meshes, range or sheet list change.
 *
 * The sheet rows are **passed in by the caller**: this screen uses the same list for the title uniqueness
 * check, so calling useSheets() again here would fetch every row and its zone_spec twice.
 */
export function useCoveringSheets(
  meshes: MeshInput[],
  clip: ClipBox,
  sheetRows: ReadonlyArray<{ title: string; zone_type: string | null; zone_spec: unknown }>,
): Covering[] {
  const existing = useMemo(() => existingSheetsFromRows(sheetRows), [sheetRows]);
  const clipKey = JSON.stringify(clip);

  return useMemo(() => {
    if (meshes.length === 0 || existing.length === 0) return []; // empty until the sheets arrive
    return findCoveringSheets(clipMeshes(meshes, clip), bridge.familiesFor(meshes), existing);
    // clipKey: only when the value changes (not the object reference)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meshes, clipKey, existing]);
}

export interface ExistingSheetsProps {
  items: Covering[];
}

export function ExistingSheets({ items }: ExistingSheetsProps) {
  if (items.length === 0) return null;
  return (
    <Paper withBorder radius="sm" px="sm" py={8}>
      <Text size="xs" fw={700} mb={4}>
        {SProposal.existingTitle(items.length)}
      </Text>
      {items.map((s) => (
        <Group key={s.sheetId} gap={8} wrap="nowrap" py={2}>
          <Text size="10px" c="dimmed" className="tnum" w={34} style={{ flexShrink: 0 }}>
            {Math.round(s.ratio * 100)}%
          </Text>
          <Text
            size="xs"
            component={Link}
            to={`/drawings?sheet=${encodeURIComponent(s.sheetId)}`}
            c="blue.7"
            truncate
            style={{ minWidth: 0 }}
          >
            {s.title}
          </Text>
        </Group>
      ))}
    </Paper>
  );
}
