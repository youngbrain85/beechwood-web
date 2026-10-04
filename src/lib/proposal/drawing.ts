// ------------------------------------------------------------------
//  Drawing fragment: draws the views of one candidate as an SVG group in drawing-area coordinates (mm).
//  **It has no text**: the title, labels and quantity table are added by the sheet
//  template, so the fragment itself is language-neutral.
//
//  Coordinates: view-local (u,v) (m) are moved to the view's slot (rect, mm).
//    x = rect.x + (u − umin)·mmPerM,  y = rect.y + (v − vmin)·mmPerM.
//  v is already positive "down the page" (basis.V), so it is not flipped.
//
//  Drawing order is hidden lines, then solid lines, so that the solid line stays on top where they overlap.
//
//  NOTE: A1 is also drawn in A3 coordinates (drawing area 304x223 mm); following the layout.ts convention the
//  sheet template scales the whole fragment by 2 onto 841x594. ViewSpec.placement, in contrast,
//  is already relative to the final canvas (0-1), so the two use different references.
// ------------------------------------------------------------------
import type { Rect } from './layout';
import type { Projection, Seg } from './project';

/* Hidden lines: thin faint grey lines. */
const HIDDEN_STYLE = 'stroke="#c0c0c0" stroke-width="0.10" fill="none"';
/* Silhouette + front feature edges. */
const SOLID_STYLE = 'stroke="#000" stroke-width="0.35" stroke-linejoin="round" fill="none"';

export interface DrawnView {
  id: string;
  rect: Rect;
  projection: Projection;
}

/* mm coordinate with 2 decimals; toFixed writes -0 as 0. */
function mm(x: number): string {
  return (Math.round(x * 100) / 100).toFixed(2);
}

function pathData(segs: Seg[], rect: Rect, umin: number, vmin: number, mmPerM: number): string {
  return segs
    .map(([u0, v0, u1, v1]) =>
      `M ${mm(rect.x + (u0 - umin) * mmPerM)} ${mm(rect.y + (v0 - vmin) * mmPerM)}`
      + ` L ${mm(rect.x + (u1 - umin) * mmPerM)} ${mm(rect.y + (v1 - vmin) * mmPerM)}`)
    .join(' ');
}

/* A set of views to one `<g class="proposal-drawing">` block. A path without lines is not emitted. */
export function drawingFragment(views: DrawnView[], mmPerM: number): string {
  const lines: string[] = ['<g class="proposal-drawing">'];

  for (const { id, rect, projection } of views) {
    const [umin, , vmin] = projection.range;
    const layers: Array<[Seg[], string]> = [
      [projection.hidden, HIDDEN_STYLE],
      [[...projection.sil, ...projection.feat], SOLID_STYLE],
    ];
    lines.push(`<g data-view="${id}">`);
    for (const [segs, style] of layers) {
      if (segs.length === 0) continue;
      lines.push(`<path d="${pathData(segs, rect, umin, vmin, mmPerM)}" ${style}/>`);
    }
    lines.push('</g>');
  }

  lines.push('</g>');
  return lines.join('\n');
}

// ------------------------------------------------------------------
//  Trust test: before a fragment read from the database is put on screen.
//
//  Why: sheet_proposals.drawing_svg goes into dangerouslySetInnerHTML.
//  The row-level policy grants every signed-in user full access, so the row may not be ours;
//  one `<image onerror>` or `<foreignObject>` line would run script in someone else's session.
//
//  How: a **line-by-line allowlist**. Only exactly the shape drawingFragment above emits passes.
//  DOMParser is not used (the engine and the validation must also run in a worker and in node).
//  A line can be hundreds of KB (path d), so only simple patterns without backtracking are used:
//  `[ML0-9 .\-]+` cannot contain `"`, so it does not overlap the `"` that follows (linear time).
// ------------------------------------------------------------------

/* Escapes regex metacharacters, so the style constants are embedded in the pattern **as is** and the emitter and the validator cannot drift apart. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const ROOT_OPEN = '<g class="proposal-drawing">';
const CLOSE = '</g>';
const VIEW_OPEN = /^<g data-view="v\d+">$/;
const PATH_LINE = new RegExp(
  `^<path d="[ML0-9 .\\-]+" (?:${escapeRegExp(HIDDEN_STYLE)}|${escapeRegExp(SOLID_STYLE)})/>$`,
);

/**
 * Is this string in the shape of **a drawing fragment emitted by our engine**.
 * The first line is `<g class="proposal-drawing">`, the last line is `</g>`, and every line between
 * must be a view group opening line, a closing line or a path line. A nesting mismatch (the root
 * closing early or the depth not ending at 0) or any other line means rejection.
 */
export function isTrustedDrawing(svg: string): boolean {
  if (typeof svg !== 'string') return false;
  const lines = svg.split('\n');
  if (lines.length < 2) return false;
  if (lines[0] !== ROOT_OPEN) return false;
  if (lines[lines.length - 1] !== CLOSE) return false;

  let depth = 1; // the first line opened the root
  for (let i = 1; i < lines.length; i++) {
    if (depth === 0) return false; // the root is already closed and more lines follow
    const line = lines[i]!;
    if (line === CLOSE) {
      depth -= 1;
      continue;
    }
    if (VIEW_OPEN.test(line)) {
      depth += 1;
      continue;
    }
    if (PATH_LINE.test(line)) continue;
    return false;
  }
  return depth === 0;
}
