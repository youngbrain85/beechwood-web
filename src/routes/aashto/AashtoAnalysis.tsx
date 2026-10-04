// ------------------------------------------------------------------
//  Damage Analysis (/analysis) — AASHTO element condition tables.
//
//  - Three summary cards: elements (number of elements with defects), active damages (CS3 and CS4 counts), overall condition (band of the lowest computed NBI rating)
//  - Element Conditions: the full v_element_condition table, grouped by component category with computed ratings, CS1-CS4 quantity and %, worst defects
//  - Damage Records: latest observations of active damages grouped from the worst condition state (CS4 to CS1), with the columns of the printed table
// ------------------------------------------------------------------
import { useMemo } from 'react';
import { Box, Paper, ScrollArea, SimpleGrid, Text } from '@mantine/core';
import { PageHeader } from '@/components/PageHeader';
import { ElementConditionTable } from '@/components/aashto/ElementConditionTable';
import { overallOf, ratingsFromRows } from '@/components/aashto/NbiHero';
import { QuantityTable } from '@/components/aashto/QuantityTable';
import { SectionTitle } from '@/components/aashto/SectionTitle';
import { useAashtoData } from '@/components/aashto/useAashtoData';
import type { RowGroup } from '@/components/aashto/rows';
import { useDamages, useElementCondition, useNbiComponents, useObjects } from '@/hooks/useSupabase';
import { SEval } from '@/i18n/s.eval';
import { BAND_COLOUR, CS_COLOUR, type ConditionState } from '@/lib/eval/aashto';

const SURFACE_SUB = 'var(--mantine-color-gray-0)';

export function AashtoAnalysis() {
  const objects = useObjects();
  const damages = useDamages();
  const nbi = useNbiComponents();
  const cond = useElementCondition();
  const a = useAashtoData(objects, damages);
  const loading = a.loading || nbi.loading || cond.loading;
  const error = a.error ?? nbi.error ?? cond.error;

  const ratings = useMemo(() => ratingsFromRows(nbi.data), [nbi.data]);
  const overall = overallOf(ratings);

  const withDefects = useMemo(() => cond.data.filter((r) => r.cs2 + r.cs3 + r.cs4 > 0).length, [cond.data]);
  const byCs = useMemo(() => {
    const c: Record<ConditionState, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const r of a.rows) if (r.cs) c[r.cs] += 1;
    return c;
  }, [a.rows]);

  /* Damage records: groups from the worst condition state (CS4 to CS1, no state last), larger quantity first inside a group */
  const groups = useMemo<RowGroup[]>(() => {
    const order: Array<ConditionState | null> = [4, 3, 2, 1, null];
    return order
      .map((cs) => ({
        key: `cs-${cs ?? 'none'}`,
        label: cs ? SEval.csLabel(cs) : SEval.notApplicable,
        rows: a.rows.filter((r) => r.cs === cs).sort((x, y) => (y.qty ?? 0) - (x.qty ?? 0) || x.objectCode.localeCompare(y.objectCode)),
      }))
      .filter((g) => g.rows.length > 0);
  }, [a.rows]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <PageHeader title={SEval.analysis.title} subtitle={SEval.analysis.subtitle} />
      <ScrollArea style={{ flex: 1 }} bg={SURFACE_SUB}>
        <Box px={28} py={24}>
          <SimpleGrid cols={{ base: 1, xs: 3 }} spacing={10} mb={20}>
            <SummaryCard
              label={SEval.analysis.cardElements}
              value={String(cond.data.length)}
              sub={SEval.analysis.cardElementsSub(withDefects)}
              colour="#3F6B4A"
            />
            <SummaryCard
              label={SEval.analysis.cardDamages}
              value={String(a.rows.length)}
              sub={SEval.analysis.cardDamagesSub(byCs[3], byCs[4])}
              colour={byCs[4] > 0 ? CS_COLOUR[4] : byCs[3] > 0 ? CS_COLOUR[3] : '#3F6B4A'}
            />
            <SummaryCard
              label={SEval.analysis.cardOverall}
              value={overall ?? SEval.notApplicable}
              sub={SEval.computedNote}
              colour={overall ? BAND_COLOUR[overall.toLowerCase() as 'good' | 'fair' | 'poor'] : '#6B7077'}
            />
          </SimpleGrid>

          <SectionTitle title={SEval.analysis.tableTitle} hint={SEval.analysis.tableHint} />
          <Paper withBorder mb={24}>
            {error ? (
              <Text fz={12.5} c="dimmed" ta="center" py={48}>
                {SEval.loadError}
              </Text>
            ) : loading && cond.data.length === 0 ? (
              <Text fz={12.5} c="dimmed" ta="center" py={48}>
                {SEval.loading}
              </Text>
            ) : (
              <ElementConditionTable rows={cond.data} worstDefects={a.worstDefects} ratings={ratings} />
            )}
          </Paper>

          <SectionTitle title={SEval.analysis.damagesTitle} hint={SEval.analysis.damagesHint} />
          <Paper withBorder>
            {groups.length === 0 ? (
              <Text fz={12.5} c="dimmed" ta="center" py={48}>
                {loading ? SEval.loading : SEval.noDamages}
              </Text>
            ) : (
              <QuantityTable groups={groups} showObject />
            )}
          </Paper>
        </Box>
      </ScrollArea>
    </div>
  );
}

function SummaryCard({ label, value, sub, colour }: { label: string; value: string; sub: string; colour: string }) {
  return (
    <Paper withBorder px={14} py={12} bg="white">
      <Text size="10px" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.1em' }}>
        {label}
      </Text>
      <Text size="22px" fw={700} mt={4} className="tnum" tt="uppercase" style={{ color: colour, letterSpacing: '0.01em' }}>
        {value}
      </Text>
      <Text size="10.5px" c="dimmed" mt={2} lh={1.35}>
        {sub}
      </Text>
    </Paper>
  );
}
