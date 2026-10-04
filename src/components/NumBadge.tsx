import { CALLOUT_SPEC, calloutGeom, type CalloutBox } from '@/lib/badgeCallout';

/**
 * Numbered callout. The placement geometry comes from `@/lib/badgeCallout` (sheet mm), the
 * single source; this component only draws the result as SVG (square 6.3 mm box, white
 * 0.53 mm border, 3.7 mm weight-800 digits). When a figure changes, change the tablet
 * app's implementation of the same spec **together** with it.
 * (Also used by the sheet overlay, components/aashto/SheetMarks.tsx.)
 */
export function NumBadge({
  box,
  no,
  hex,
  cw,
  ch,
}: {
  box: CalloutBox;
  no: number;
  hex: string;
  cw: number;
  ch: number;
}) {
  const g = calloutGeom(box, no, cw, ch);
  return (
    <g>
      {g.hasLeader && (
        <line
          x1={g.x1}
          y1={g.y1}
          x2={g.x2}
          y2={g.y2}
          stroke={hex}
          strokeWidth={CALLOUT_SPEC.leaderWidthMm}
          strokeLinecap="round"
        />
      )}
      <rect
        x={g.x}
        y={g.y}
        width={g.w}
        height={g.h}
        fill={hex}
        stroke="#fff"
        strokeWidth={CALLOUT_SPEC.borderMm}
      />
      <text
        x={g.x + g.w / 2}
        y={g.y + g.h / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={CALLOUT_SPEC.fontMm}
        fontWeight={800}
        fill="#fff"
      >
        {String(no)}
      </text>
    </g>
  );
}
