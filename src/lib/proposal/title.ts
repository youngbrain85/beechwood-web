// ------------------------------------------------------------------
//  Title suggestion — `<fine part> (<codes>, <ranges>) — <composition name>`.
//
//  The title is a **stored value**. The pieces that differ per bridge — station/elevation range labels,
//  the object-code label and how the head is joined — come from the bridge profile as a TitleFormat
//  (src/bridge — proposal.title); the separator ` — ` (U+2014, one space each side) and the trailing
//  composition name are common. There is no default format.
// ------------------------------------------------------------------
import type { ClipBox, Vec3 } from './types';

/** Title separator — U+2014 EM DASH. */
const DASH = '—';

function isDigit(c: string): boolean {
  return c >= '0' && c <= '9';
}

/**
 * Natural-order comparison: digit runs as numbers, the rest by code unit.
 * Gives `A_9 < A_10` and `C05 < C10`. localeCompare is not used: a locale-dependent result would make
 * the stored value (the title) differ between devices. For digit runs of equal value (`C5` vs `C05`)
 * the one with fewer leading zeros comes first, which fixes the order.
 */
export function naturalCompare(a: string, b: string): number {
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const ca = a[i]!;
    const cb = b[j]!;
    if (isDigit(ca) && isDigit(cb)) {
      let ia = i;
      let ib = j;
      while (ia < a.length && isDigit(a[ia]!)) ia++;
      while (ib < b.length && isDigit(b[ib]!)) ib++;
      const na = a.slice(i, ia).replace(/^0+(?=\d)/, '');
      const nb = b.slice(j, ib).replace(/^0+(?=\d)/, '');
      if (na.length !== nb.length) return na.length - nb.length; // more digits means a larger number
      if (na !== nb) return na < nb ? -1 : 1;
      if (ia - i !== ib - j) return ia - i - (ib - j); // equal value: fewer leading zeros first
      i = ia;
      j = ib;
      continue;
    }
    if (ca !== cb) return ca < cb ? -1 : 1;
    i++;
    j++;
  }
  return a.length - i - (b.length - j); // the one with something left comes later
}

/**
 * Title format — the three pieces that differ per bridge.
 *   · clipLabels: range labels of the narrowed axes (the bridge's station / elevation notation)
 *   · codeLabel: label of the object codes (one · a range · "first + N more")
 *   · head: fine part + inside of the parentheses → head (the fine part alone when the inside is empty)
 */
export interface TitleFormat {
  clipLabels(clip: ClipBox): string[];
  codeLabel(codes: string[]): string;
  head(fine: string, inside: string): string;
}

export interface TitleInput {
  fine: string;
  codes: string[];
  compositionName: string;
  clip: ClipBox;
  bounds: { min: Vec3; max: Vec3 };
}

/**
 * `<fine part> (<codes>, <ranges>) — <composition name>` in the format of the bridge profile.
 * `bounds` is accepted for later refinements of the notation and is not used yet.
 */
export function suggestTitle(a: TitleInput, fmt: TitleFormat): string {
  const inside = [fmt.codeLabel(a.codes), ...fmt.clipLabels(a.clip)].filter((s) => s.length > 0).join(', ');
  return `${fmt.head(a.fine, inside)} ${DASH} ${a.compositionName}`;
}

/**
 * Should the title field of the screen follow the engine's automatic suggestion.
 *
 * Once the user edits the title (`titleTouched`) the suggestion is no longer followed. But
 * **when the title suggested by the engine changes** (another card, another selection) the edit is forgotten
 * and the new suggestion is followed; otherwise the old title stays and the proposal is saved under the name of a different composition.
 */
export function shouldFollowSuggestion(a: {
  /* The title the engine suggests now (empty string without candidates). */
  suggested: string;
  /* The suggestion seen last (null on the first render). */
  lastSuggested: string | null;
  titleTouched: boolean;
}): boolean {
  return a.suggested !== a.lastSuggested || !a.titleTouched;
}

/* Appends ` (2)`, ` (3)` ... to a title already in use so that it does not collide. */
export function uniqueTitle(title: string, taken: ReadonlySet<string>): string {
  if (!taken.has(title)) return title;
  for (let n = 2; ; n++) {
    const next = `${title} (${n})`;
    if (!taken.has(next)) return next;
  }
}
