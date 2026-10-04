// ------------------------------------------------------------------
//  Dashboard (/) — AASHTO/NBI.
//
//  - Hero: bridge name and subtitle (profile), four facts, three NBI component ratings (v_nbi_components, looked up by component), overall condition
//  - Element condition summary: the compact v_element_condition table (CS bar, worst CS)
//  - Recent damages: the 6 latest observations of active damages (defect, object, element, CS)
//  NBI ratings are indicators computed from element condition, which the hero always states.
//  When either view query (v_nbi_components, v_element_condition) fails, the hook's error text is shown instead of a silent N/A or "0 elements"
//  (s.eval overview.ratingsError, elementsError; on a database without the views "relation ... does not exist" shows as is).
// ------------------------------------------------------------------
import { useMemo } from 'react';
import { Grid, Group, Paper, ScrollArea, Text } from '@mantine/core';
import { PageHeader } from '@/components/PageHeader';
import { CsBadge, defectLabel } from '@/components/aashto/cs';
import { ElementConditionTable } from '@/components/aashto/ElementConditionTable';
import { NbiHero, ratingsFromRows } from '@/components/aashto/NbiHero';
import { SectionTitle } from '@/components/aashto/SectionTitle';
import { useAashtoData } from '@/components/aashto/useAashtoData';
import { bridge } from '@/bridge';
import { useDamages, useElementCondition, useNbiComponents, useObjects, useSheets } from '@/hooks/useSupabase';
import { SEval } from '@/i18n/s.eval';
import { formatDate } from '@/lib/format';

const LINE = '1px solid var(--mantine-color-gray-3)';

export function AashtoOverview() {
  const objects = useObjects();
  const damages = useDamages();
  const sheets = useSheets();
  const nbi = useNbiComponents();
  const cond = useElementCondition();
  const a = useAashtoData(objects, damages);
  const loading = a.loading || sheets.loading || nbi.loading || cond.loading;

  const ratings = useMemo(() => ratingsFromRows(nbi.data), [nbi.data]);

  /* Last observation date: the latest among the latest observations of active damages */
  const latestDate = useMemo(() => {
    let latest: string | null = null;
    for (const r of a.rows) if (r.observedAt && (!latest || Date.parse(r.observedAt) > Date.parse(latest))) latest = r.observedAt;
    return latest ? formatDate(new Date(latest)) : '-';
  }, [a.rows]);

  /* The 6 most recent damages, latest observation first */
  const recent = useMemo(
    () =>
      [...a.rows]
        .sort((x, y) => (Date.parse(y.observedAt ?? '') || 0) - (Date.parse(x.observedAt ?? '') || 0))
        .slice(0, 6),
    [a.rows],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <PageHeader
        title={SEval.overview.title}
        subtitle={SEval.overview.subtitle(bridge.texts.bridgeName)}
        right={
          <Text size="11px" c="dimmed" className="tnum">
            {loading ? SEval.loading : SEval.overview.asOf(latestDate)}
          </Text>
        }
      />

      <ScrollArea style={{ flex: 1 }}>
        <div style={{ padding: '24px 28px' }}>
          <NbiHero
            bridgeName={bridge.texts.bridgeName}
            bridgeSub={bridge.texts.bridgeSub}
            ratings={ratings}
            ratingsError={nbi.error ? SEval.overview.ratingsError(nbi.error.message) : null}
            facts={{
              objects: objects.data.length,
              damages: a.rows.length,
              sheets: sheets.data.length,
              lastObserved: latestDate,
            }}
          />

          <section style={{ marginTop: 24 }}>
            <Grid columns={5} gutter="lg">
              <Grid.Col span={{ base: 5, md: 3 }}>
                <SectionTitle
                  title={SEval.overview.elementsTitle}
                  hint={cond.error ? undefined : SEval.overview.elementsHint(cond.data.length)}
                />
                <Paper withBorder>
                  {cond.error ? (
                    <Text role="alert" fz={12.5} c="red.8" ta="center" px={20} py={40} style={{ overflowWrap: 'anywhere' }}>
                      {SEval.overview.elementsError(cond.error.message)}
                    </Text>
                  ) : (
                    <ElementConditionTable rows={cond.data} variant="compact" />
                  )}
                </Paper>
              </Grid.Col>

              <Grid.Col span={{ base: 5, md: 2 }}>
                <SectionTitle title={SEval.overview.recentTitle} hint={SEval.overview.recentHint} />
                <Paper withBorder>
                  {recent.length === 0 ? (
                    <Text fz={12.5} c="dimmed" ta="center" px={20} py={48}>
                      {loading ? SEval.loading : SEval.noDamages}
                      <br />
                      {loading ? null : SEval.noDamagesHint}
                    </Text>
                  ) : (
                    recent.map((r, i) => (
                      <Group
                        key={r.id}
                        justify="space-between"
                        align="flex-start"
                        gap={12}
                        px={20}
                        py={12}
                        wrap="nowrap"
                        style={{ borderTop: i > 0 ? LINE : undefined }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <Text fz={12.5} fw={500} truncate>
                            {defectLabel(r.defectNo, r.defectName)}
                          </Text>
                          <Text fz={11} c="dimmed" truncate>
                            {[r.objectCode, r.elementNo !== null ? SEval.numbered(r.elementNo, r.elementName ?? '') : null, r.round]
                              .filter(Boolean)
                              .join(' · ')}
                          </Text>
                        </div>
                        <Group gap={8} wrap="nowrap" style={{ flexShrink: 0 }}>
                          <Text fz={10.5} c="dimmed" className="tnum">
                            {r.observedAt ? formatDate(new Date(r.observedAt)) : '-'}
                          </Text>
                          <CsBadge cs={r.cs} size="xs" />
                        </Group>
                      </Group>
                    ))
                  )}
                </Paper>
              </Grid.Col>
            </Grid>
          </section>
        </div>
      </ScrollArea>
    </div>
  );
}
