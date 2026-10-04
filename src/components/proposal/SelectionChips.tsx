import { Badge, Button, Group, Pill, Text } from '@mantine/core';
import { SProposal } from '@/i18n/s.proposal';

// ------------------------------------------------------------------
//  Sheet proposals: lists the chosen object codes as chips; the x on a chip removes that one.
//
//  A one-line summary (`BW_BEAM_A1, BW_BEAM_A2 ... +3`) shows neither what is included nor how to
//  remove one item. With many chips only the first CHIP_LIMIT show and the rest fold into a count,
//  because hundreds of chips would cover the screen.
//
//  Codes are always ASCII and shown as is; the only texts are the aria-label of the x and
//  the description of the folded chip.
// ------------------------------------------------------------------

/* Chips shown at once; the rest fold into a single `+N`. */
export const CHIP_LIMIT = 12;

/* Chips to show and the folded count. The given order is kept (sorting is up to the caller). */
export function chipsToShow(
  codes: readonly string[],
  max: number = CHIP_LIMIT,
): { shown: string[]; more: number } {
  if (codes.length <= max) return { shown: [...codes], more: 0 };
  return { shown: codes.slice(0, max), more: codes.length - max };
}

export interface SelectionChipsProps {
  /* Chosen object codes (in display order). */
  codes: string[];
  /* Selected triangle count (before cutting). */
  triangles: number;
  /* Remove one chip. */
  onRemove: (code: string) => void;
  /* Clear all. */
  onClear: () => void;
}

export function SelectionChips({ codes, triangles, onRemove, onClear }: SelectionChipsProps) {
  const { shown, more } = chipsToShow(codes);

  return (
    <Group gap={6} wrap="wrap" align="center">
      {codes.length === 0 ? (
        <Text size="10px" c="dimmed">
          {SProposal.selectionNone}
        </Text>
      ) : (
        <>
          {shown.map((code) => (
            <Pill
              key={code}
              size="xs"
              withRemoveButton
              onRemove={() => onRemove(code)}
              removeButtonProps={{ 'aria-label': SProposal.removeSelection(code) }}
            >
              {code}
            </Pill>
          ))}
          {more > 0 ? (
            <Badge size="xs" variant="light" color="gray" title={SProposal.moreSelected(more)}>
              {`+${more}`}
            </Badge>
          ) : null}
          <Text size="10px" c="dimmed" className="tnum">
            {SProposal.selectionTriangles(triangles)}
          </Text>
        </>
      )}
      <Button
        size="compact-xs"
        variant="subtle"
        ml="auto"
        disabled={codes.length === 0}
        onClick={onClear}
      >
        {SProposal.clearSelection}
      </Button>
    </Group>
  );
}
