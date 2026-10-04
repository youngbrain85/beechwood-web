// ------------------------------------------------------------------
//  Condition state (CS) display atoms: CS badge, CS distribution bar, worst CS of a row.
//  Colors come from the single table lib/eval/aashto CS_COLOUR (CS1 green, CS2 yellow, CS3 orange, CS4 red). Badge text is chosen
//  for contrast: white on CS1 and CS4, ink on CS2 (yellow) and CS3 (orange), where white would be too faint.
// ------------------------------------------------------------------
import { Badge, Text } from '@mantine/core';
import { SEval } from '@/i18n/s.eval';
import { CS_COLOUR, DEFECTS, share, type ConditionState } from '@/lib/eval/aashto';
import { formatPct } from './format';

const INK = '#0e1114';

/* CS badge text color */
export const csInk = (cs: ConditionState): string => (cs === 2 || cs === 3 ? INK : '#fff');

/* Worst CS of an element condition row: the worst state that has quantity (1 if none) */
export function worstCsOf(row: { cs2: number; cs3: number; cs4: number }): ConditionState {
  if (row.cs4 > 0) return 4;
  if (row.cs3 > 0) return 3;
  if (row.cs2 > 0) return 2;
  return 1;
}

/* Defect number to '1080 Delamination/Spall/Patched Area' (number only if not in the library, unspecified if there is no number) */
export function defectLabel(defectNo: number | null | undefined, fallbackName?: string): string {
  if (!defectNo) return fallbackName || SEval.unknownDefect;
  const d = DEFECTS.find((x) => x.no === defectNo);
  return SEval.numbered(defectNo, d?.name ?? fallbackName ?? '').trim();
}

export function CsBadge({ cs, size = 'sm' }: { cs: ConditionState | null; size?: 'xs' | 'sm' | 'md' }) {
  if (cs === null) {
    return (
      <Text component="span" fz={12} c="dimmed">
        —
      </Text>
    );
  }
  return (
    <Badge
      size={size}
      radius={0}
      className="tnum"
      data-cs={cs}
      title={SEval.csLabel(cs)}
      style={{ background: CS_COLOUR[cs], color: csInk(cs), fontWeight: 700, letterSpacing: '0.04em' }}
    >
      {SEval.cs(cs)}
    </Badge>
  );
}

/* Small CS color swatch (legends, table headers) */
export function CsSwatch({ cs, size = 10 }: { cs: ConditionState; size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{ display: 'inline-block', width: size, height: size, background: CS_COLOUR[cs], flexShrink: 0 }}
    />
  );
}

/* CS1-CS4 distribution bar: segment width = quantity share (a non-zero segment is at least 2px so it shows) */
export function CsBar({
  cs,
  total,
  height = 8,
}: {
  cs: readonly [number, number, number, number];
  total: number;
  height?: number;
}) {
  const shares = cs.map((q) => share(q, total));
  const title = shares.map((s, i) => `${SEval.cs(i + 1)} ${formatPct(s)}`).join(' · ');
  return (
    <div
      data-cs-bar=""
      title={title}
      style={{ display: 'flex', width: '100%', height, background: 'var(--mantine-color-gray-2)', overflow: 'hidden' }}
    >
      {shares.map((s, i) => (
        <span
          key={i}
          style={{
            width: `${(s * 100).toFixed(1)}%`,
            minWidth: cs[i]! > 0 ? 2 : 0,
            background: CS_COLOUR[(i + 1) as ConditionState],
          }}
        />
      ))}
    </div>
  );
}
