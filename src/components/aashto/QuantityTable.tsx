// ------------------------------------------------------------------
//  Element condition quantity table, with the columns of the printed sheet table "ELEMENT CONDITION QUANTITIES":
//    No. / Element / Defect / CS / Qty / Unit / Notes   (i18n/s.eval SQtyCols, the pipeline's EL_COLS)
//  Rows are rows.ts damageRows (latest observation of each active damage); groups are groupRows (by object or by sheet).
//  A by-sheet group mixes several objects on one sheet, so the object code is added under the element (showObject).
//  Row expansion (optional): with a `detail` renderer a row opens on click or Enter/Space and shows that content in
//  one row below it (the sheet viewer shows the photos and key facts of the damage there). One row is open at a time.
//  Without `detail` the table is exactly as before (plain rows).
// ------------------------------------------------------------------
import { Fragment, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { Table, Text } from '@mantine/core';
import { SEval, SQtyCols } from '@/i18n/s.eval';
import { CsBadge, defectLabel } from './cs';
import { formatQty } from './format';
import type { AashtoDamageRow, RowGroup } from './rows';

const LINE = '1px solid var(--mantine-color-gray-3)';
const SURFACE_SUB = 'var(--mantine-color-gray-0)';
const INK = 'var(--mantine-color-dark-9)';
const INK_MID = 'var(--mantine-color-gray-7)';

const HEAD: CSSProperties = {
  padding: '9px 12px',
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--mantine-color-gray-6)',
  whiteSpace: 'nowrap',
};
const CELL: CSSProperties = { padding: '9px 12px', verticalAlign: 'top', fontSize: 12.5 };

/* Column widths (the printed table's relative widths 7, 22, 22, 7, 12, 9, 15 as screen shares) */
const COL_W = ['6%', '24%', '24%', '7%', '9%', '8%', '22%'];

export interface QuantityTableProps {
  groups: readonly RowGroup[];
  showObject?: boolean;
  /* Content of the row opened under a damage row. Given, rows become expandable; left out, rows are plain. */
  detail?: (row: AashtoDamageRow) => ReactNode;
  /* Row (damage id) open at first; only read with `detail`. */
  initialExpandedId?: string | null;
}

export function QuantityTable({ groups, showObject = false, detail, initialExpandedId = null }: QuantityTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(initialExpandedId);
  const toggle = (id: string) => setExpandedId((cur) => (cur === id ? null : id));
  return (
    <Table.ScrollContainer minWidth={900}>
      <Table style={{ fontSize: 12.5 }}>
        <Table.Thead bg={SURFACE_SUB}>
          <Table.Tr>
            {SQtyCols.map((c, i) => (
              <Table.Th
                key={c}
                style={{ ...HEAD, width: COL_W[i], textAlign: c === 'No.' || c === 'Qty' ? 'right' : 'left' }}
              >
                {c}
              </Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {groups.map((g) => (
            <Fragment key={g.key}>
              <Table.Tr bg={SURFACE_SUB}>
                <Table.Td colSpan={SQtyCols.length} style={{ ...CELL, borderTop: LINE }}>
                  <Text fz={12} fw={700} span style={{ color: INK }}>
                    {g.label ?? SEval.quantities.noSheet}
                  </Text>
                  <Text fz={11} c="dimmed" span ml={10}>
                    {SEval.quantities.groupSummary(g.rows.length)}
                  </Text>
                </Table.Td>
              </Table.Tr>
              {g.rows.map((r) => {
                const open = !!detail && expandedId === r.id;
                return (
                  <Fragment key={r.id}>
                    <Table.Tr
                      {...(detail
                        ? {
                            'data-damage-id': r.id,
                            'aria-expanded': open,
                            tabIndex: 0,
                            onClick: () => toggle(r.id),
                            onKeyDown: (e: KeyboardEvent) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                toggle(r.id);
                              }
                            },
                            style: { cursor: 'pointer' },
                            bg: open ? 'var(--mantine-color-blue-0)' : undefined,
                          }
                        : {})}
                    >
                      <Table.Td className="tnum" style={{ ...CELL, textAlign: 'right', fontWeight: 600, color: INK }}>
                        {r.no ?? '—'}
                      </Table.Td>
                      <Table.Td style={{ ...CELL, color: INK }}>
                        {r.elementNo !== null ? SEval.numbered(r.elementNo, r.elementName ?? '') : '—'}
                        {showObject && r.objectCode ? (
                          <Text fz={10.5} c="dimmed" className="tnum">
                            {r.objectCode}
                          </Text>
                        ) : null}
                      </Table.Td>
                      <Table.Td style={{ ...CELL, color: INK }}>{defectLabel(r.defectNo, r.defectName)}</Table.Td>
                      <Table.Td style={CELL}>
                        <CsBadge cs={r.cs} size="xs" />
                      </Table.Td>
                      <Table.Td className="tnum" style={{ ...CELL, textAlign: 'right', fontWeight: 600, color: INK }}>
                        {r.qty !== null ? formatQty(r.qty) : '—'}
                      </Table.Td>
                      <Table.Td style={{ ...CELL, color: INK_MID, whiteSpace: 'nowrap' }}>{r.unit ?? '—'}</Table.Td>
                      <Table.Td style={{ ...CELL, color: INK_MID }}>
                        <Text fz={11.5} lineClamp={2} c={INK_MID}>
                          {r.notes || '—'}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                    {open ? (
                      <Table.Tr data-damage-detail={r.id}>
                        <Table.Td colSpan={SQtyCols.length} bg={SURFACE_SUB} style={{ padding: '10px 12px' }}>
                          {detail(r)}
                        </Table.Td>
                      </Table.Tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </Fragment>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
