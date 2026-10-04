// ------------------------------------------------------------------
//  AASHTO overlay of the sheet viewer — drawn by routes/Dashboard.tsx.
//
//  - Damage shapes: takes the overlay geometry (Dashboard overlayItems: view placement, paths, marker boxes, canvas mm);
//    the color is the condition state (CS1-CS4), a point damage is a defect glyph (the printed LEGEND shapes), plus numbered callouts.
//  - Right-hand table: fills the cells of the frame's "ELEMENT CONDITION QUANTITIES" (No./Element/Defect/CS/Qty/Unit/Notes).
//  - Paper scale (sheetTable paperScale: A3 1, A1 2): an A1 sheet is the A3 layout scaled by 2 as a whole (pipeline
//    wrap_a1), so table origin, column widths, row pitch, text, glyphs and stroke widths grow by the scale. The numbered callout
//    is a fixed sheet-mm spec shared with the tablet app (lib/badgeCallout): the spec stays, computed in A3 units and drawn under scale(k).
//  Only active damages are drawn (a damage missing from the row list is skipped, the same rule as the list and the table).
// ------------------------------------------------------------------
import { NumBadge } from '@/components/NumBadge';
import type { CalloutBox } from '@/lib/badgeCallout';
import { CS_COLOUR, NOT_RATED_COLOUR, defectSymbol } from '@/lib/eval/aashto';
import { DefectGlyph } from './legends';
import type { AashtoDamageRow } from './rows';
import { EL_TABLE, elCells, elColRect, elRowTop, paperScale } from './sheetTable';

/* One overlay damage (canvas mm): only the fields used from the Dashboard overlayItems shape */
export interface SheetMarkItem {
  /* Damage id (damages.id): the key that links it to a quantity table row */
  key: string;
  no: number;
  kind: 'path' | 'point' | 'rect';
  pts: Array<[number, number]>;
  closed: boolean;
  box: CalloutBox;
}

/* A3 base sizes (mm), grown by the scale */
const GLYPH_W_MM = 7; // a little smaller than the printed legend chip (8.5 mm)
const GLYPH_RATIO = 5.4 / 8.5;
const STROKE_MM = 0.7;
/* Estimated characters per cell: glyph width is about 0.55 x font size */
const CHAR_W = 0.55;

/* Text for a cell: on overflow one character fewer plus an ellipsis (trailing spaces trimmed) */
function fit(text: string, colW: number, fontMm: number): string {
  const max = Math.floor(colW / (fontMm * CHAR_W) + 1e-9);
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…` : text;
}

export function AashtoSheetMarks({
  overlay,
  rows,
  cw,
  ch,
  fontMm,
}: {
  overlay: readonly SheetMarkItem[];
  rows: readonly AashtoDamageRow[];
  /* Canvas mm (zone_spec.canvas_mm) */
  cw: number;
  ch: number;
  /* A3 base table font size (mm), grown by the scale */
  fontMm: number;
}) {
  const k = paperScale(cw);
  const font = fontMm * k;
  const glyphW = GLYPH_W_MM * k;
  const glyphH = glyphW * GLYPH_RATIO;
  const stroke = STROKE_MM * k;
  const byId = new Map(rows.map((r) => [r.id, r]));
  return (
    <>
      {overlay.map((o) => {
        const r = byId.get(o.key);
        if (!r) return null;
        const hex = r.cs ? CS_COLOUR[r.cs] : NOT_RATED_COLOUR;
        const ptsStr = o.pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
        const cx = o.box.x + o.box.w / 2;
        const cy = o.box.y + o.box.h / 2;
        return (
          <g key={o.key}>
            {o.kind === 'path' && o.closed ? (
              <polygon points={ptsStr} fill={`${hex}22`} stroke={hex} strokeWidth={stroke} strokeLinejoin="round" />
            ) : o.kind === 'path' ? (
              <polyline points={ptsStr} fill="none" stroke={hex} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
            ) : (
              <DefectGlyph
                symbol={defectSymbol(r.defectNo)}
                colour={hex}
                x={cx - glyphW / 2}
                y={cy - glyphH / 2}
                width={glyphW}
                framed={false}
                backdrop
              />
            )}
            {/* Numbered callout: computed in A3 units and grown by the scale (the spec is fixed sheet mm, shared with the tablet app) */}
            <g transform={k === 1 ? undefined : `scale(${k})`}>
              <NumBadge
                box={{ x: o.box.x / k, y: o.box.y / k, w: o.box.w / k, h: o.box.h / k }}
                no={o.no}
                hex={hex}
                cw={cw / k}
                ch={ch / k}
              />
            </g>
          </g>
        );
      })}
      {rows.slice(0, EL_TABLE.maxRows).map((row, i) => {
        const top = elRowTop(i, k);
        return (
          <g key={row.id}>
            {elCells(row).map((text, c) => {
              if (!text) return null;
              const [x, w] = elColRect(c, k);
              return (
                <text
                  key={c}
                  data-el-cell={`${i}:${c}`}
                  x={x + w / 2}
                  y={top + (EL_TABLE.rowH * k) / 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={font}
                  fill={EL_TABLE.ink}
                >
                  {fit(text, w, font)}
                </text>
              );
            })}
          </g>
        );
      })}
    </>
  );
}
