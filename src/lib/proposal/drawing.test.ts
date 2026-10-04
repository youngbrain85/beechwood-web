// ------------------------------------------------------------------
//  Trust test of a drawing fragment: a drawing read from the database (sheet_proposals.drawing_svg)
//  goes into dangerouslySetInnerHTML. The row-level policy grants every signed-in user full access, so another
//  user may have planted it; only **exactly** the shape the engine emits passes.
// ------------------------------------------------------------------
import { describe, expect, it } from 'vitest';
import { box } from './__fixtures__/shapes';
import { drawingFragment, isTrustedDrawing } from './drawing';
import { runEngine } from './engine';
import { NO_CLIP } from './types';

/* Joins the lines the way the engine does (\n). */
const frag = (...lines: string[]): string =>
  ['<g class="proposal-drawing">', ...lines, '</g>'].join('\n');

const OK_PATH = '<path d="M 10.00 20.00 L 30.00 40.00" stroke="#000" stroke-width="0.35" stroke-linejoin="round" fill="none"/>';
const OK_HIDDEN = '<path d="M 1.00 2.00 L 3.00 4.00" stroke="#c0c0c0" stroke-width="0.10" fill="none"/>';

describe('isTrustedDrawing', () => {
  it('fragments made by the engine pass: every real candidate', () => {
    const cands = runEngine({ meshes: [box([-1, 0, -1], [1, 10, 1], 'COL')], clip: NO_CLIP, objectCodes: ['COL'] });
    expect(cands.length).toBeGreaterThan(0);
    for (const c of cands) expect(isTrustedDrawing(c.drawing)).toBe(true);
  });

  it('the empty result of drawingFragment (no views) passes too', () => {
    expect(isTrustedDrawing(drawingFragment([], 1))).toBe(true);
  });

  it('a hand-written minimal shape: view group + hidden lines + solid lines', () => {
    expect(isTrustedDrawing(frag('<g data-view="v1">', OK_HIDDEN, OK_PATH, '</g>'))).toBe(true);
    expect(isTrustedDrawing(frag('<g data-view="v12">', OK_PATH, '</g>'))).toBe(true);
  });

  it.each([
    ['empty string', ''],
    ['no head line', '<g data-view="v1">\n</g>'],
    ['a script line', frag('<g data-view="v1">', '<script>alert(1)</script>', '</g>')],
    ['an image onerror line', frag('<g data-view="v1">', '<image href="x" onerror="alert(1)"/>', '</g>')],
    ['a foreignObject line', frag('<g data-view="v1">', '<foreignObject><b>x</b></foreignObject>', '</g>')],
    [
      'an extra attribute on path',
      frag('<g data-view="v1">', '<path d="M 1.00 2.00" stroke="#000" stroke-width="0.35" stroke-linejoin="round" fill="none" onload="alert(1)"/>', '</g>'),
    ],
    ['z in d', frag('<g data-view="v1">', '<path d="M 1.00 2.00 z" stroke="#000" stroke-width="0.35" stroke-linejoin="round" fill="none"/>', '</g>')],
    ['lowercase l in d', frag('<g data-view="v1">', '<path d="M 1.00 2.00 l 3.00 4.00" stroke="#000" stroke-width="0.35" stroke-linejoin="round" fill="none"/>', '</g>')],
    ['url( in d', frag('<g data-view="v1">', '<path d="url(#x)" stroke="#000" stroke-width="0.35" stroke-linejoin="round" fill="none"/>', '</g>')],
    ['onclick on a view group', frag('<g data-view="v1" onclick="alert(1)">', OK_PATH, '</g>')],
    ['a view group id that is not v + digits', frag('<g data-view="evil">', OK_PATH, '</g>')],
    ['one closing g missing', '<g class="proposal-drawing">\n<g data-view="v1">\n' + OK_PATH + '\n</g>'],
    ['one closing g too many', frag('<g data-view="v1">', OK_PATH, '</g>', '</g>')],
    ['more lines after the root closed', '<g class="proposal-drawing">\n</g>\n<g data-view="v1">\n</g>'],
    ['a style that is not our constant', frag('<g data-view="v1">', '<path d="M 1.00 2.00" stroke="#f00" stroke-width="9" fill="none"/>', '</g>')],
    ['everything on one line', '<g class="proposal-drawing"><g data-view="v1">' + OK_PATH + '</g></g>'],
  ])('%s is rejected', (_name, svg) => {
    expect(isTrustedDrawing(svg)).toBe(false);
  });
});
