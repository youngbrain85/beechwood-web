/**
 * ───────────────────────────────────────────────────────────────────────────
 *  Numbered badge callout: the reference spec (shared by the tablet app and the web)
 *
 *  NOTE: when a figure or rule in this table changes, **change the other implementation with it.**
 *     Tablet app : the badge callout module of the tablet app
 *     Web        : src/lib/badgeCallout.ts
 *     Parity     : the two implementations must agree within 0.05 mm
 *
 *  | Item           | Value (all in sheet mm)                      |
 *  |---------------|----------------------------------------------|
 *  | Gap            | 4.2 mm                                       |
 *  | Badge height   | 6.3 mm                                       |
 *  | Badge width    | max(6.3, digits x 2.1 + 2.8) mm              |
 *  | Text           | 3.7 mm, weight 800, white                    |
 *  | White border   | 0.53 mm                                      |
 *  | Leader width   | 0.35 mm                                      |
 *  | Edge margin    | 1.0 mm (flip threshold and clamp margin)     |
 *  | Tolerance      | 1e-6 mm (an exact fit counts as "fits")      |
 *  | Leader hidden  | length <= 0.2 mm                             |
 *  | Default side   | diagonally outside the bbox top-left corner  |
 *  | Flip           | per axis, **checking room on the far side**  |
 *  | Clamp          | into the canvas if a flip fails (1.0 mm)     |
 *  | Leader end     | badge corner to bbox center ray, at the bbox |
 *
 *  Sizes and distances are **fixed in sheet mm**. Whatever the device or board pixel size, the
 *  ratio to the drawing does not change (the tablet app converts with pxPerMm = board width px / sheet canvas_mm[0]).
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Background: a number label drawn on top of a small damage hides the damage, so the badge is
 * moved away by a **fixed distance that does not depend on the bbox size** and joined with a thin
 * leader, like a callout box. There is no collision-resolution algorithm
 * (only a fixed offset, edge flips and a clamp).
 */

/* Damage bbox (sheet mm) */
export interface CalloutBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/* Reference figures, all in sheet mm. One-to-one with the table above. */
export const CALLOUT_SPEC = {
  /* Gap between the damage bbox corner and the badge corner */
  gapMm: 4.2,
  /* Badge height (= minimum width) */
  badgeHeightMm: 6.3,
  /* Badge width = max(height, digits x glyphW + padW) */
  badgeGlyphWMm: 2.1,
  badgePadWMm: 2.8,
  /* Digit size (weight 800, white) */
  fontMm: 3.7,
  /* White border of the badge */
  borderMm: 0.53,
  /* Leader width (thinner than the 0.7 mm damage stroke) */
  leaderWidthMm: 0.35,
  /* Canvas edge margin: the flip threshold and the clamp margin */
  marginMm: 1.0,
  /* Leaders shorter than this are not drawn */
  leaderMinMm: 0.2,
  /**
   * Tolerance for the flip threshold comparison. When the room is **exactly** the margin
   * (e.g. box.x = 11.5 mm gives exactly 1.0 mm on the left), the direction of the floating-point
   * error decides left versus right. The tablet app computes in px, so the error direction
   * changes with the scale and **the same sheet got its badge on opposite sides on different devices**
   * (a case found by a parity check). A near-tie therefore counts as "fits",
   * which fixes the result on both sides and at every scale.
   */
  epsMm: 1e-6,
  /* Fallback when the sheet spec has no canvas_mm (A3 landscape) */
  fallbackCanvasMm: [420, 297] as [number, number],
} as const;

/* Badge width (mm) that holds the number [no] */
export function badgeWidthMm(no: number): number {
  const digits = String(Math.abs(Math.trunc(no))).length;
  return Math.max(
    CALLOUT_SPEC.badgeHeightMm,
    digits * CALLOUT_SPEC.badgeGlyphWMm + CALLOUT_SPEC.badgePadWMm,
  );
}

/* Callout placement result: badge rectangle + two leader points (all in sheet mm) */
export interface CalloutGeom {
  /* Badge rectangle */
  x: number;
  y: number;
  w: number;
  h: number;
  /* Placement direction (-1 = left/up, +1 = right/down) */
  dirX: -1 | 1;
  dirY: -1 | 1;
  /* Leader start = the badge corner facing the damage */
  x1: number;
  y1: number;
  /* Leader end = where the ray (start point to bbox center) meets the bbox edge */
  x2: number;
  y2: number;
  /* Whether the leader is longer than leaderMinMm and worth drawing */
  hasLeader: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/**
 * Numbered callout placement (reference implementation). Inputs and outputs are sheet mm.
 *
 * 1. By default, diagonally outside the top-left corner of the bbox, by gap.
 * 2. Flip per axis only when the near side has no room **and the far side has room**.
 *    (If the far side is tight too, flipping only makes it worse, so the default side is kept.)
 * 3. If a flip does not help, clamp into the canvas (margin marginMm).
 * 4. The leader starts at the badge corner facing the damage and runs along the ray to the bbox center
 *    only up to the bbox **edge**, so it never covers the damage itself.
 */
export function calloutGeom(
  box: CalloutBox,
  no: number,
  cw: number,
  ch: number,
): CalloutGeom {
  const {
    gapMm: gap,
    badgeHeightMm: bh,
    marginMm: margin,
    leaderMinMm,
    epsMm: eps,
  } = CALLOUT_SPEC;
  const bw = badgeWidthMm(no);

  // -- X axis: outside on the left by default. Stays left if the right side is short of room too.
  const leftX = box.x - gap - bw;
  const rightX = box.x + box.w + gap;
  const dirX: -1 | 1 =
    leftX >= margin - eps || rightX + bw > cw - margin + eps ? -1 : 1;
  let x = dirX < 0 ? leftX : rightX;

  // -- Y axis: outside on top by default. Same rule.
  const topY = box.y - gap - bh;
  const bottomY = box.y + box.h + gap;
  const dirY: -1 | 1 =
    topY >= margin - eps || bottomY + bh > ch - margin + eps ? -1 : 1;
  let y = dirY < 0 ? topY : bottomY;

  // -- Canvas clamp (last resort)
  x = clamp(x, margin, Math.max(margin, cw - margin - bw));
  y = clamp(y, margin, Math.max(margin, ch - margin - bh));

  // -- Leader: badge corner facing the damage, to the bbox center ray at the bbox edge
  const x1 = dirX < 0 ? x + bw : x;
  const y1 = dirY < 0 ? y + bh : y;
  const dx = box.x + box.w / 2 - x1;
  const dy = box.y + box.h / 2 - y1;
  const tx = dx !== 0 ? ((dx > 0 ? box.x : box.x + box.w) - x1) / dx : -Infinity;
  const ty = dy !== 0 ? ((dy > 0 ? box.y : box.y + box.h) - y1) / dy : -Infinity;
  const t = clamp(Math.max(tx, ty), 0, 1);
  const x2 = x1 + dx * t;
  const y2 = y1 + dy * t;

  return {
    x,
    y,
    w: bw,
    h: bh,
    dirX,
    dirY,
    x1,
    y1,
    x2,
    y2,
    hasLeader: Math.hypot(x2 - x1, y2 - y1) > leaderMinMm,
  };
}
