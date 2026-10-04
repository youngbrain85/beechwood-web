// ------------------------------------------------------------------
//  Member tree paths: a node is identified by its **path** (`Beams/Span A/Beam 1`), not its label.
//
//  Labels repeat across branches (`Span A` under both Deck and Beams, `Bearings` under every bent and at the top level).
//  With the label as selection key, expansion key or React key, the same-named row of another branch would light up too, so paths are used.
//  The path of a top-level node is its label as is.
//  Expansion is recorded as one path: the ancestors of the open path count as open too (an accordion that opens one branch at a time).
// ------------------------------------------------------------------

/* Path separator; never used in tree labels. */
export const PATH_SEP = '/';

/* Parent path + label to the node path (a top-level path is the label as is). */
export function nodePath(parent: string | null, label: string): string {
  return parent === null ? label : `${parent}${PATH_SEP}${label}`;
}

/* path is expanded when open (the one open path) is path itself or points below it. */
export function isOpenPath(open: string | null, path: string): boolean {
  return open !== null && (open === path || open.startsWith(path + PATH_SEP));
}

/**
 * The next expansion state after a row is pressed: a closed path opens (sibling branches fold), and
 * an open one (itself or something below it is open) folds to its parent. At the top level this equals `open === label ? null : label`.
 */
export function togglePath(open: string | null, path: string, parent: string | null): string | null {
  return isOpenPath(open, path) ? parent : path;
}

/**
 * Row indent (px), 32px per level. A node row (with the expand arrow) is 20 at level 1 and a child row (leaf, id) 52 at level 2;
 * the third level goes one more step (32px) in.
 */
export const nodeIndent = (depth: number): number => 20 + 32 * (depth - 1);
export const leafIndent = (depth: number): number => 52 + 32 * (depth - 2);
