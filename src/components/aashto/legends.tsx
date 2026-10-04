// ------------------------------------------------------------------
//  Defect glyphs and legends.
//
//  DefectGlyph: the 8 defect glyphs of the printed sheet LEGEND (same 8.5x5.4 mm chip coordinates and shapes as the
//    pipeline's sheet generator) + a diamond for defects without a glyph (bearing movement, distortion, impact damage).
//    The sheet viewer draws a point damage with this glyph, stroked in the condition state color.
//  DefectLegend: legend under the sheet viewer: the glyphs used on this sheet + the "marker color = condition state" key.
//  CsHeatmapLegend: 3D condition heatmap legend: object count per worst CS + count of objects without an AASHTO element.
// ------------------------------------------------------------------
import { useId, type ReactNode } from 'react';
import { Group, Paper, Text } from '@mantine/core';
import { SEval } from '@/i18n/s.eval';
import { NOT_RATED_COLOUR, type ConditionState, type DefectSymbolKey } from '@/lib/eval/aashto';
import { CsSwatch } from './cs';

export type SymbolKey = DefectSymbolKey | 'other';

const W = 8.5;
const H = 5.4;

/* Chip-local point list to an SVG path d */
const poly = (pts: ReadonlyArray<readonly [number, number]>, close = false): string =>
  'M' + pts.map(([x, y]) => `${x} ${y}`).join(' L') + (close ? ' Z' : '');

/* 45-degree hatch (slope +1 rising / -1 falling): lines covering the whole chip (cut to the shape with a clipPath) */
function hatchLines(step: number, slope: 1 | -1): Array<[number, number, number, number]> {
  const out: Array<[number, number, number, number]> = [];
  for (let k = -H; k < W + H; k += step) {
    out.push(slope > 0 ? [k, H, k + H, 0] : [k, 0, k + H, H]);
  }
  return out;
}

const BLOB: ReadonlyArray<readonly [number, number]> = [
  [1.3, 2.9], [2.0, 1.4], [4.0, 0.9], [6.4, 1.3], [7.3, 2.8], [6.5, 4.3], [4.1, 4.6], [2.0, 4.1],
];
const BOX: ReadonlyArray<readonly [number, number]> = [
  [1.2, 1.0], [7.3, 1.0], [7.3, 4.4], [1.2, 4.4],
];

/* One defect glyph chip */
export function DefectGlyph({
  symbol,
  colour = '#141A1F',
  width = 34,
  framed = true,
  x,
  y,
  backdrop = false,
}: {
  symbol: SymbolKey;
  colour?: string;
  /* Width: px in a legend, sheet mm in the sheet overlay (nested SVG) */
  width?: number;
  /* Chip border (legend); a marker on a sheet has none */
  framed?: boolean;
  /* Top-left (sheet mm) when placed as a nested SVG: the sheet viewer overlay */
  x?: number;
  y?: number;
  /* Translucent white backing so it reads over drawing lines */
  backdrop?: boolean;
}) {
  const clip = useId().replace(/:/g, '');
  const stroke = { fill: 'none', stroke: colour, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  let body: ReactNode;
  switch (symbol) {
    case 'crack':
      body = <path d={poly([[0.9, 3.5], [2.2, 1.8], [3.5, 3.6], [4.8, 1.7], [6.1, 3.5], [7.6, 1.9]])} {...stroke} strokeWidth={0.28} />;
      break;
    case 'spall':
      body = (
        <>
          <clipPath id={clip}>
            <path d={poly(BLOB, true)} />
          </clipPath>
          <g clipPath={`url(#${clip})`}>
            {hatchLines(0.9, 1).map(([x1, y1, x2, y2], i) => (
              <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={colour} strokeWidth={0.14} />
            ))}
          </g>
          <path d={poly(BLOB, true)} {...stroke} strokeWidth={0.25} />
        </>
      );
      break;
    case 'rebar':
      body = [1.6, 2.7, 3.8].map((y) => <line key={y} x1={1.6} y1={y} x2={6.9} y2={y} stroke={colour} strokeWidth={0.42} />);
      break;
    case 'efflor':
      body = [1.4, 2.7, 4.0].flatMap((y, row) =>
        Array.from({ length: row === 1 ? 6 : 5 }, (_, k) => (
          <circle key={`${row}-${k}`} cx={1.4 + k * 1.25 + (row === 1 ? -0.62 : 0)} cy={y} r={0.2} fill={colour} />
        )),
      );
      break;
    case 'abrasion':
      body = <path d="M0.9 2.7 Q2.05 1.2 3.2 2.7 T5.4 2.7 T7.6 2.7" {...stroke} strokeWidth={0.28} />;
      break;
    case 'corrosion':
      body = (
        <>
          <clipPath id={clip}>
            <path d={poly(BOX, true)} />
          </clipPath>
          <g clipPath={`url(#${clip})`}>
            {[...hatchLines(1.1, 1), ...hatchLines(1.1, -1)].map(([x1, y1, x2, y2], i) => (
              <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={colour} strokeWidth={0.14} />
            ))}
          </g>
          <path d={poly(BOX, true)} {...stroke} strokeWidth={0.22} />
        </>
      );
      break;
    case 'leakage':
      body = (
        <path
          d="M4.25 0.8 C4.9 1.9 5.8 2.7 5.8 3.6 A1.55 1.55 0 0 1 2.7 3.6 C2.7 2.7 3.6 1.9 4.25 0.8 Z"
          {...stroke}
          strokeWidth={0.25}
        />
      );
      break;
    case 'settlement':
      body = (
        <>
          <path d={poly([[0.9, 1.7], [3.8, 1.7], [3.8, 3.9], [7.6, 3.9]])} {...stroke} strokeWidth={0.28} />
          <line x1={5.8} y1={0.9} x2={5.8} y2={3.0} stroke={colour} strokeWidth={0.18} />
          <path d={poly([[5.35, 2.45], [5.8, 3.05], [6.25, 2.45]])} {...stroke} strokeWidth={0.18} />
        </>
      );
      break;
    default:
      // Defect without a glyph: a diamond
      body = <path d={poly([[4.25, 0.8], [6.2, 2.7], [4.25, 4.6], [2.3, 2.7]], true)} {...stroke} strokeWidth={0.28} />;
  }
  return (
    <svg
      x={x}
      y={y}
      width={width}
      height={(width * H) / W}
      viewBox={`0 0 ${W} ${H}`}
      data-symbol={symbol}
      role="img"
      aria-label={SEval.symbol[symbol]}
      style={{ display: 'block', flexShrink: 0, overflow: 'visible' }}
    >
      {framed ? <rect x={0.08} y={0.08} width={W - 0.16} height={H - 0.16} fill="#fff" stroke="#141A1F" strokeWidth={0.16} /> : null}
      {backdrop ? <rect x={0} y={0} width={W} height={H} fill="#fff" fillOpacity={0.8} /> : null}
      {body}
    </svg>
  );
}

/* Sheet viewer legend: the glyphs used on this sheet (in the given order) + marker color = condition state */
export function DefectLegend({ symbols }: { symbols: readonly SymbolKey[] }) {
  return (
    <div style={{ marginTop: 12 }}>
      <Text fz={10.5} fw={700} tt="uppercase" c="dimmed" style={{ letterSpacing: '0.1em' }}>
        {SEval.drawings.legendTitle}
      </Text>
      <Group gap={16} mt={6} wrap="wrap">
        {symbols.map((k) => (
          <Group key={k} gap={6} wrap="nowrap">
            <DefectGlyph symbol={k} width={30} />
            <Text fz={11.5} c="gray.7">
              {SEval.symbol[k]}
            </Text>
          </Group>
        ))}
      </Group>
      <Group gap={12} mt={8} wrap="wrap">
        <Text fz={10.5} c="dimmed">
          {SEval.drawings.csKey}
        </Text>
        {([1, 2, 3, 4] as ConditionState[]).map((cs) => (
          <Group key={cs} gap={4} wrap="nowrap">
            <CsSwatch cs={cs} />
            <Text fz={11} c="gray.7">
              {SEval.cs(cs)}
            </Text>
          </Group>
        ))}
      </Group>
    </div>
  );
}

/* 3D condition heatmap legend: object count per worst CS */
export function CsHeatmapLegend({ counts }: { counts: Record<ConditionState | 'none', number> }) {
  return (
    <Paper withBorder px="sm" py={8} w={220}>
      <Text size="9px" fw={700} c="dimmed" style={{ letterSpacing: '0.1em' }}>
        {SEval.model.legendTitle}
      </Text>
      {([1, 2, 3, 4] as ConditionState[]).map((cs) => (
        <Group key={cs} gap={8} mt={4} wrap="nowrap">
          <CsSwatch cs={cs} size={12} />
          <Text size="xs" className="tnum">
            {SEval.cs(cs)}
          </Text>
          <Text size="xs" c="dimmed">
            {SEval.csName[cs]}
          </Text>
          <Text size="xs" c="dimmed" ml="auto" className="tnum">
            {counts[cs]}
          </Text>
        </Group>
      ))}
      <Group gap={8} mt={6} pt={6} wrap="nowrap" style={{ borderTop: '1px solid var(--mantine-color-gray-3)' }}>
        <span style={{ display: 'inline-block', width: 12, height: 12, background: NOT_RATED_COLOUR, flexShrink: 0 }} />
        <Text size="10px" c="dimmed">
          {SEval.model.notRated}
        </Text>
        <Text size="xs" c="dimmed" ml="auto" className="tnum">
          {counts.none}
        </Text>
      </Group>
    </Paper>
  );
}
