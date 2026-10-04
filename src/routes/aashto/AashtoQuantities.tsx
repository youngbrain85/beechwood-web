// ------------------------------------------------------------------
//  Damage Quantity (/quantities) — AASHTO element condition quantities.
//
//  Groups the latest observations of active damages (condition state quantities) by object or by sheet and shows them with the
//  columns of the printed sheet table "ELEMENT CONDITION QUANTITIES" (No. / Element / Defect / CS / Qty / Unit / Notes).
//  Filters: component category (element category: deck, super, sub, other) and condition state (CS1-CS4).
// ------------------------------------------------------------------
import { useMemo, useState, type ReactNode } from 'react';
import { Box, Group, Paper, ScrollArea, SegmentedControl, Text, UnstyledButton } from '@mantine/core';
import { PageHeader } from '@/components/PageHeader';
import { QuantityTable } from '@/components/aashto/QuantityTable';
import { groupRows } from '@/components/aashto/rows';
import { useAashtoData } from '@/components/aashto/useAashtoData';
import { useDamages, useObjects, useSheets } from '@/hooks/useSupabase';
import { SEval } from '@/i18n/s.eval';
import type { ElementCategory } from '@/lib/eval/aashto';

const SURFACE_SUB = 'var(--mantine-color-gray-0)';
const CATEGORIES: readonly ElementCategory[] = ['deck', 'super', 'sub', 'other'];

export function AashtoQuantities() {
  const objects = useObjects();
  const damages = useDamages();
  const sheets = useSheets();
  const a = useAashtoData(objects, damages);
  const loading = a.loading || sheets.loading;
  const error = a.error ?? sheets.error;

  const [groupBy, setGroupBy] = useState<'object' | 'sheet'>('object');
  const [category, setCategory] = useState<'all' | ElementCategory>('all');
  const [cs, setCs] = useState<'all' | '1' | '2' | '3' | '4'>('all');

  const sheetsById = useMemo(() => new Map(sheets.data.map((s) => [s.id, s])), [sheets.data]);
  const rows = useMemo(
    () =>
      a.rows.filter(
        (r) => (category === 'all' || r.category === category) && (cs === 'all' || r.cs === Number(cs)),
      ),
    [a.rows, category, cs],
  );
  const groups = useMemo(() => groupRows(rows, groupBy, sheetsById), [rows, groupBy, sheetsById]);
  const filtered = category !== 'all' || cs !== 'all';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <PageHeader
        title={SEval.quantities.title}
        subtitle={SEval.quantities.subtitle}
        right={
          <Text className="tnum" fz={11} c="dimmed">
            {loading ? SEval.loading : SEval.quantities.count(rows.length, a.rows.length)}
          </Text>
        }
      />
      <ScrollArea style={{ flex: 1 }} bg={SURFACE_SUB}>
        <Box px={28} py={24}>
          <Paper withBorder mb="md" px={20} py={16}>
            <Group gap={20} align="flex-end" wrap="wrap">
              <Field label={SEval.quantities.groupBy}>
                <SegmentedControl
                  size="xs"
                  value={groupBy}
                  onChange={(v) => setGroupBy(v as 'object' | 'sheet')}
                  data={[
                    { value: 'object', label: SEval.quantities.byObject },
                    { value: 'sheet', label: SEval.quantities.bySheet },
                  ]}
                />
              </Field>
              <Field label={SEval.quantities.componentFilter}>
                <SegmentedControl
                  size="xs"
                  value={category}
                  onChange={(v) => setCategory(v as 'all' | ElementCategory)}
                  data={[
                    { value: 'all', label: SEval.all },
                    ...CATEGORIES.map((c) => ({ value: c, label: SEval.component[c] })),
                  ]}
                />
              </Field>
              <Field label={SEval.quantities.csFilter}>
                <SegmentedControl
                  size="xs"
                  value={cs}
                  onChange={(v) => setCs(v as 'all' | '1' | '2' | '3' | '4')}
                  data={[
                    { value: 'all', label: SEval.all },
                    ...([1, 2, 3, 4] as const).map((n) => ({ value: String(n), label: SEval.cs(n) })),
                  ]}
                />
              </Field>
              {filtered ? (
                <UnstyledButton
                  ml="auto"
                  onClick={() => {
                    setCategory('all');
                    setCs('all');
                  }}
                >
                  <Text fz={11.5} fw={500} c="dimmed">
                    {SEval.quantities.reset}
                  </Text>
                </UnstyledButton>
              ) : null}
            </Group>
          </Paper>

          <Paper withBorder>
            {error ? (
              <Empty message={SEval.loadError} />
            ) : loading && a.rows.length === 0 ? (
              <Empty message={SEval.loading} />
            ) : a.rows.length === 0 ? (
              <Empty message={`${SEval.noDamages} ${SEval.noDamagesHint}`} />
            ) : groups.length === 0 ? (
              <Empty message={SEval.quantities.empty} />
            ) : (
              <QuantityTable groups={groups} showObject={groupBy === 'sheet'} />
            )}
          </Paper>
        </Box>
      </ScrollArea>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box>
      <Text component="label" fz={12} fw={500} display="block" mb={4}>
        {label}
      </Text>
      {children}
    </Box>
  );
}

function Empty({ message }: { message: string }) {
  return (
    <Text ta="center" fz={12.5} c="dimmed" px={20} py={64}>
      {message}
    </Text>
  );
}
