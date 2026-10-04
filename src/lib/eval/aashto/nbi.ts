// NBI component rating rules (deck/superstructure/substructure). The reference is the pipeline's schema.sql:
// v_element_condition.rating · v_nbi_components(= seed_beechwood.nbi_rating · nbi_components):
//   Element rating   = the ladder of one element: total T, shares s2/s3/s4 = that element's CS quantity / T (T = 0 gives shares 0, i.e. 9).
//     9 if s2+s3+s4=0 · 8 if s3+s4=0 && s2<0.10 · 7 if s3+s4=0 ·
//     6 if s4=0 && s3<0.10 · 5 if s4<0.05 · 4 if s4<0.25 · 3 otherwise.
//   Component rating = **minimum** element rating of the component's elements (total > 0), or 9 with nothing to rate.
//   Quantities of elements with different units (sq ft, ft, each) are never added: a rule that sums them (Q = sum of
//   element totals) would mix a column count (each) and a cap length (ft) in one denominator.
// The ladder is evaluated in order (first match wins). Example: with s4=0 and s3>=0.10 the "6" line fails and
// the next line "5 if s4<0.05" (always true for s4=0) applies, giving 5.
import type { Component, ElementCondition } from './types';

/* Element no to NBI component (deck/super/sub). null means the element gets no NBI rating (the UI shows N/A). */
export const COMPONENT_OF: Record<number, Component | null> = {
  12: 'deck',
  510: 'deck',
  109: 'super',
  310: 'super',
  205: 'sub',
  210: 'sub',
  215: 'sub',
  234: 'sub',
  321: null,
  301: null,
  305: null,
  331: null,
};

/**
 * Minimum tolerance against floating-point error. s2/s3/s4 are divisions "sum of observed quantity / total quantity",
 * and a sum of such results that is mathematically exactly 0 (or some boundary value) can come out as a tiny
 * non-zero value because of binary rounding (the classic 0.1+0.2 problem). Comparing with "<= EPS" instead of
 * "=== 0" absorbs that. Threshold comparisons such as "< 0.10", in contrast, stay strict as the rule states
 * (loosening them would move the boundaries away from the rule).
 */
const EPS = 1e-9;

/**
 * Ladder rating (0-9) of one element; shares are relative to **that element's own** total (v_element_condition.rating).
 * A total of 0 gives 9 (like the view's coalesce(cs / nullif(total, 0), 0); no division by zero).
 */
export function elementRating(c: ElementCondition): number {
  if (c.total <= 0) return 9;
  const s2 = c.cs[1] / c.total;
  const s3 = c.cs[2] / c.total;
  const s4 = c.cs[3] / c.total;

  if (s2 + s3 + s4 <= EPS) return 9;
  if (s3 + s4 <= EPS && s2 < 0.1) return 8;
  if (s3 + s4 <= EPS) return 7;
  if (s4 <= EPS && s3 < 0.1) return 6;
  if (s4 < 0.05) return 5;
  if (s4 < 0.25) return 4;
  return 3;
}

/**
 * NBI component rating (0-9): minimum elementRating of the elements in conds that map to the component and have total > 0.
 * 9 with nothing to rate (coalesce(min(rating), 9) of v_nbi_components).
 */
export function componentRating(conds: ElementCondition[], component: Component): number {
  const rated = conds.filter((c) => COMPONENT_OF[c.elementNo] === component && c.total > 0);
  return rated.reduce((min, c) => Math.min(min, elementRating(c)), 9);
}

/* Overall condition from the minimum of deck/super/sub: 7 and above Good, 5-6 Fair, 4 and below Poor. */
export function overallCondition(r: { deck: number; super: number; sub: number }): 'Good' | 'Fair' | 'Poor' {
  const min = Math.min(r.deck, r.super, r.sub);
  if (min >= 7) return 'Good';
  if (min >= 5) return 'Fair';
  return 'Poor';
}
