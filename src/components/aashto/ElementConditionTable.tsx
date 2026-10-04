// ------------------------------------------------------------------
//  Element condition table: total quantity and CS1-CS4 quantity and share per AASHTO element.
//
//  Rows = v_element_condition (the database view sums per element; nothing is summed again here).
//  - Full version (analysis): grouped by component category (deck, super, sub, other) with the computed rating
//    (v_nbi_components) on the heading; other (approach slabs, joints, railings) gets no NBI component rating,
//    so N/A. Columns: Element, Unit, Total Qty, CS1-CS4 (quantity + %), Rating (v_element_condition.rating +
//    NBI descriptor), Worst Defects (worst CS per defect; observations.worstDefectsByElement).
//    Component rating = minimum of its elements' ratings, so the Rating cell of the element that set it is bold.
//  - Compact version (dashboard): Element, Total Qty, Condition (CS bar), Worst (worst CS badge).
// ------------------------------------------------------------------
import { Fragment, type CSSProperties, type ReactNode } from 'react';
import { Group, Table, Text } from '@mantine/core';
import { SEval } from '@/i18n/s.eval';
import {
  BAND_COLOUR,
  ratingBand,
  share,
  type ConditionState,
  type ElementCategory,
  type WorstDefect,
} from '@/lib/eval/aashto';
import type { ElementConditionRow } from '@/types/db';
import { CsBadge, CsBar, CsSwatch, defectLabel, worstCsOf } from './cs';
import { formatPct, formatQty } from './format';
import type { NbiRatings } from './NbiHero';

const LINE = '1px solid var(--mantine-color-gray-3)';
const SURFACE_SUB = 'var(--mantine-color-gray-0)';
const INK = 'var(--mantine-color-dark-9)';
const INK_MID = 'var(--mantine-color-gray-7)';

/* Group order: the three NBI components, then other */
const CATEGORY_ORDER: readonly ElementCategory[] = ['deck', 'super', 'sub', 'other'];

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
const NUM: CSSProperties = { ...CELL, textAlign: 'right', whiteSpace: 'nowrap' };

export function ElementConditionTable({
  rows,
  worstDefects,
  ratings,
  variant = 'full',
}: {
  rows: readonly ElementConditionRow[];
  worstDefects?: ReadonlyMap<number, readonly WorstDefect[]>;
  ratings?: NbiRatings;
  variant?: 'full' | 'compact';
}) {
  return variant === 'compact' ? <CompactTable rows={rows} /> : <FullTable rows={rows} worstDefects={worstDefects} ratings={ratings} />;
}

function FullTable({
  rows,
  worstDefects,
  ratings,
}: {
  rows: readonly ElementConditionRow[];
  worstDefects?: ReadonlyMap<number, readonly WorstDefect[]>;
  ratings?: NbiRatings;
}) {
  return (
    <Table.ScrollContainer minWidth={1060}>
      <Table style={{ fontSize: 12.5 }}>
        <Table.Thead bg={SURFACE_SUB}>
          <Table.Tr>
            <Table.Th style={{ ...HEAD, width: '27%' }}>{SEval.element}</Table.Th>
            <Table.Th style={HEAD}>{SEval.unit}</Table.Th>
            <Table.Th style={{ ...HEAD, textAlign: 'right' }}>{SEval.analysis.totalQty}</Table.Th>
            {([1, 2, 3, 4] as ConditionState[]).map((cs) => (
              <Table.Th key={cs} style={{ ...HEAD, textAlign: 'right', borderLeft: cs === 1 ? LINE : undefined }}>
                <Group gap={5} justify="flex-end" wrap="nowrap">
                  <CsSwatch cs={cs} size={8} />
                  {SEval.cs(cs)}
                </Group>
              </Table.Th>
            ))}
            <Table.Th style={{ ...HEAD, textAlign: 'right', borderLeft: LINE }}>{SEval.analysis.rating}</Table.Th>
            <Table.Th style={{ ...HEAD, borderLeft: LINE, width: '26%' }}>{SEval.analysis.worstDefects}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {CATEGORY_ORDER.map((cat) => {
            const group = rows.filter((r) => r.category === cat);
            if (group.length === 0) return null;
            // Component rating (group heading): minimum of the element ratings in that category. other has none (N/A)
            const componentRating = cat === 'other' ? null : (ratings?.[cat] ?? null);
            return (
              <Fragment key={cat}>
                <Table.Tr bg={SURFACE_SUB}>
                  <Table.Td colSpan={9} style={{ ...CELL, borderTop: LINE }}>
                    <Text fz={11} fw={700} tt="uppercase" style={{ letterSpacing: '0.08em', color: INK }} span>
                      {SEval.component[cat]}
                    </Text>
                    <Text fz={11} c="dimmed" span>
                      {' — '}
                      {groupRating(cat, ratings)}
                    </Text>
                  </Table.Td>
                </Table.Tr>
                {group.map((r) => (
                  <Table.Tr key={r.element_no}>
                    <Table.Td style={{ ...CELL, fontWeight: 500, color: INK }}>{SEval.numbered(r.element_no, r.name)}</Table.Td>
                    <Table.Td style={{ ...CELL, color: INK_MID, whiteSpace: 'nowrap' }}>{r.unit}</Table.Td>
                    <Table.Td className="tnum" style={{ ...NUM, fontWeight: 600, color: INK }}>
                      {formatQty(r.total_qty)}
                    </Table.Td>
                    {[r.cs1, r.cs2, r.cs3, r.cs4].map((q, i) => (
                      <Table.Td key={i} className="tnum" style={{ ...NUM, borderLeft: i === 0 ? LINE : undefined }}>
                        <QtyPct qty={q} total={r.total_qty} emphasise={i > 0 && q > 0} />
                      </Table.Td>
                    ))}
                    <RatingCell rating={r.rating} drives={componentRating !== null && r.rating === componentRating} />
                    <Table.Td style={{ ...CELL, borderLeft: LINE }}>
                      <WorstDefectList items={worstDefects?.get(r.element_no) ?? []} />
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Fragment>
            );
          })}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

function groupRating(cat: ElementCategory, ratings: NbiRatings | undefined): string {
  if (cat === 'other') return SEval.analysis.notRated;
  const r = ratings?.[cat] ?? null;
  return r === null ? SEval.notApplicable : SEval.analysis.componentRating(r, SEval.ratingWord[r] ?? '');
}

/**
 * Element rating cell: band swatch and rating on top, NBI descriptor below. drives = this element's rating equals
 * the group's component rating (the minimum), i.e. it set the rating, so it is bold (data-drives-rating).
 */
function RatingCell({ rating, drives }: { rating: number; drives: boolean }) {
  return (
    <Table.Td className="tnum" style={{ ...NUM, borderLeft: LINE }} data-drives-rating={drives ? '' : undefined}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: drives ? 700 : 500, color: drives ? INK : INK_MID }}>
        <span aria-hidden="true" style={{ display: 'inline-block', width: 8, height: 8, background: BAND_COLOUR[ratingBand(rating)] }} />
        {rating}
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--mantine-color-gray-6)' }}>{SEval.ratingWord[rating] ?? ''}</div>
    </Table.Td>
  );
}

/* CS cell: quantity on top, share below (bold for CS2-4 with quantity) */
function QtyPct({ qty, total, emphasise }: { qty: number; total: number; emphasise: boolean }) {
  return (
    <>
      <div style={{ fontWeight: emphasise ? 700 : 500, color: emphasise ? INK : INK_MID }}>{formatQty(qty)}</div>
      <div style={{ fontSize: 10.5, color: 'var(--mantine-color-gray-6)' }}>{formatPct(share(qty, total))}</div>
    </>
  );
}

/* Worst defects: at most 3, plus the count of the rest */
function WorstDefectList({ items }: { items: readonly WorstDefect[] }): ReactNode {
  if (items.length === 0) {
    return (
      <Text fz={11.5} c="dimmed">
        {SEval.noDefects}
      </Text>
    );
  }
  const shown = items.slice(0, 3);
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      {shown.map((d) => (
        <Group key={d.defectNo} gap={6} wrap="nowrap" justify="space-between">
          <Text fz={11.5} style={{ color: INK, minWidth: 0 }} truncate title={defectLabel(d.defectNo)}>
            {defectLabel(d.defectNo)}
          </Text>
          <CsBadge cs={d.cs} size="xs" />
        </Group>
      ))}
      {items.length > shown.length ? (
        <Text fz={10.5} c="dimmed">
          +{items.length - shown.length}
        </Text>
      ) : null}
    </div>
  );
}

function CompactTable({ rows }: { rows: readonly ElementConditionRow[] }) {
  return (
    <Table style={{ fontSize: 12.5 }}>
      <Table.Thead bg={SURFACE_SUB}>
        <Table.Tr>
          <Table.Th style={HEAD}>{SEval.element}</Table.Th>
          <Table.Th style={{ ...HEAD, textAlign: 'right' }}>{SEval.analysis.totalQty}</Table.Th>
          <Table.Th style={{ ...HEAD, width: '30%' }}>{SEval.overview.condition}</Table.Th>
          <Table.Th style={{ ...HEAD, textAlign: 'right' }}>{SEval.overview.worst}</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rows.map((r) => (
          <Table.Tr key={r.element_no}>
            <Table.Td style={{ ...CELL, fontWeight: 500, color: INK }}>{SEval.numbered(r.element_no, r.name)}</Table.Td>
            <Table.Td className="tnum" style={{ ...NUM, color: INK_MID }}>
              {formatQty(r.total_qty)} {r.unit}
            </Table.Td>
            <Table.Td style={{ ...CELL, verticalAlign: 'middle' }}>
              <CsBar cs={[r.cs1, r.cs2, r.cs3, r.cs4]} total={r.total_qty} />
            </Table.Td>
            <Table.Td style={{ ...NUM, verticalAlign: 'middle' }}>
              <CsBadge cs={worstCsOf(r)} size="xs" />
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}
