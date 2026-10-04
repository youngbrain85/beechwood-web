// ------------------------------------------------------------------
//  Saved proposal list: each row also shows paper and scale.
//  A stored spec is outside data, so a malformed one leaves the cell empty.
// ------------------------------------------------------------------
import { describe, expect, it } from 'vitest';
import type { ProposalSpec } from '@/lib/proposal/engine';
import { paperScale } from './ProposalList';

/* A spec with only the needed fields; paperScale reads canvas_mm and layout only. */
const spec = (canvas: unknown, layout: unknown): ProposalSpec =>
  ({ canvas_mm: canvas, layout } as unknown as ProposalSpec);

describe('paperScale', () => {
  it('A3 canvas + scale', () => {
    expect(paperScale(spec([420, 297], { scale: '1:75' }))).toBe('A3 1:75');
  });

  it('A1 canvas + scale: wider than 500 mm means A1', () => {
    expect(paperScale(spec([841, 594], { scale: '1:500' }))).toBe('A1 1:500');
  });

  it('spec.layout.paper wins when present', () => {
    expect(paperScale(spec([420, 297], { scale: '1:75', paper: 'A1' }))).toBe('A1 1:75');
  });

  it('shows whichever half can be read, which beats nothing', () => {
    expect(paperScale(spec(null, { scale: '1:75' }))).toBe('1:75');
    expect(paperScale(spec([841, 594], {}))).toBe('A1');
    // Even with a broken layout the canvas width still tells the paper.
    expect(paperScale(spec([420, 297], 'x'))).toBe('A3');
    // An unknown paper value is ignored and the canvas width decides.
    expect(paperScale(spec([841, 594], { paper: 'A0', scale: '1:500' }))).toBe('A1 1:500');
  });

  // A jsonb not null column still accepts JSON null; one such row must not break the list render.
  it.each([
    ['spec is null', null],
    ['spec is undefined', undefined],
    ['spec is a string', 'x'],
    ['spec is an array', []],
  ])('leaves the cell empty without throwing when spec is not an object: %s', (_name, s) => {
    expect(paperScale(s as unknown as ProposalSpec)).toBeNull();
  });

  it.each([
    ['empty object', spec(undefined, undefined)],
    ['canvas_mm is a string', spec('420,297', {})],
    ['canvas_mm is an empty array', spec([], {})],
    ['scale is a number and there is no canvas', spec(null, { scale: 75 })],
    ['paper is unknown and there is no canvas', spec(null, { paper: 'A0' })],
  ])('leaves the cell empty when nothing can be read: %s', (_name, s) => {
    expect(paperScale(s)).toBeNull();
  });
});
