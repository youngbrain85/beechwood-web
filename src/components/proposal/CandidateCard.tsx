import { Badge, Box, Text, UnstyledButton } from '@mantine/core';
import type { Candidate } from '@/lib/proposal/engine';
import { COMPOSITION_NAME, SProposal } from '@/i18n/s.proposal';

// ------------------------------------------------------------------
//  Sheet proposals: one candidate card.
//
//  The thumbnail is the **same SVG** as the large preview (viewBox untouched, fitted to the column width).
//  A separately drawn picture would let the card and the large view drift apart.
//  For the input contract of dangerouslySetInnerHTML see the header of CandidatePreview.tsx.
// ------------------------------------------------------------------

const pct = (x: number): number => Math.round(x * 100);

export interface CandidateCardProps {
  candidate: Candidate;
  /* The composed sheet SVG (null until the frame has loaded). */
  svg: string | null;
  selected: boolean;
  onSelect: () => void;
}

export function CandidateCard({ candidate, svg, selected, onSelect }: CandidateCardProps) {
  const { metrics, warnings } = candidate;
  return (
    <UnstyledButton
      data-testid="candidate-card"
      onClick={onSelect}
      style={{
        display: 'block',
        textAlign: 'left',
        background: '#fff',
        border: selected
          ? '1px solid var(--mantine-color-blue-6)'
          : '1px solid var(--mantine-color-gray-3)',
        boxShadow: selected ? 'inset 0 0 0 1px var(--mantine-color-blue-6)' : undefined,
      }}
    >
      <Box
        style={{
          background: 'var(--mantine-color-gray-1)',
          borderBottom: '1px solid var(--mantine-color-gray-2)',
          padding: 6,
        }}
      >
        {svg ? (
          <div className="sheet-svg" dangerouslySetInnerHTML={{ __html: svg }} />
        ) : (
          // Before the frame arrives: reserve the paper ratio (A3 landscape) so the card does not jump.
          <Box style={{ aspectRatio: '420 / 297', background: '#fff' }} />
        )}
      </Box>

      <Box px={10} py={8}>
        <Text size="xs" fw={700} lh={1.3}>
          {COMPOSITION_NAME[candidate.key]}
        </Text>
        <Text size="10px" c="dimmed" className="tnum" mt={2}>
          {SProposal.cardMeta(metrics.views, metrics.paper, metrics.denom)}
        </Text>
        <Text size="10px" c="dimmed" className="tnum" mt={1} title={SProposal.coverageTip}>
          {SProposal.cardCoverage(pct(metrics.coverage), pct(metrics.fill))}
        </Text>
        {warnings.includes('scale_small') ? (
          <Badge
            size="xs"
            variant="outline"
            mt={6}
            style={{ color: '#8B6A1F', borderColor: '#8B6A1F', textTransform: 'none', fontWeight: 600 }}
          >
            {SProposal.warnScaleSmall}
          </Badge>
        ) : null}
      </Box>
    </UnstyledButton>
  );
}
