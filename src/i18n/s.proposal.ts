// ------------------------------------------------------------------
//  UI strings — sheet proposals (selection viewer · member tree · range · candidate gallery · saved proposals).
//
//  Rules: see s.app.ts. Stored values (title · composition name · view label) are English and come
//  from the bridge profile (src/bridge/beechwood/proposal.ts) — the screens show them as stored.
// ------------------------------------------------------------------
import { proposalProfile } from '@/bridge/proposal';
import type { CompositionKey } from '@/lib/proposal/types';
import { formatNumber } from '@/lib/format';

export const SProposal = {
  // ---- Screen heading ----
  pageTitle: 'Sheet Proposals',
  pageSubtitle: 'Pick a part and we build 2D damage-map candidates — adopting one saves it as a proposal.',
  savedProposals: (n: number): string => `Saved Proposals (${n})`,

  // ---- Member tree ----
  treeTitle: 'Member Tree',
  clearSelection: 'Clear All',

  // ---- Range ----
  rangeTitle: 'Narrow the Range',
  rangeLongitudinal: 'Longitudinal',
  rangeHeight: 'Height',
  rangeTransverse: 'Transverse',
  rangeReset: 'Full Range',
  rangeNoSelection: 'Select a member first.',

  // ---- Selection viewer ----
  viewerLoading: 'Loading model…',
  viewerError: 'Could not load the model',
  viewerHint: 'Click a mesh to select · Ctrl+click to add/remove · drag to rotate',
  selectionNone: 'Nothing selected',
  selectionTriangles: (n: number): string => `${formatNumber(n)} triangles`,
  fitSelection: 'Fit to Selection',
  fitAll: 'Fit All',
  /* The x of a selection chip; codes are ASCII and read as is. */
  removeSelection: (code: string): string => `Remove ${code}`,
  /* Description (title) of the `+N` shown when chips are folded. */
  moreSelected: (n: number): string => `${n} more selected`,

  // ---- Candidate generation status ----
  hintPickPart: 'Pick a part in the 3D view or the member tree on the left.',
  computing: 'Building candidates…',
  computingProgress: (done: number, total: number): string => `Building candidates… ${done}/${total}`,
  /* Selection-stage guard (**before** cutting; SelectViewer EXTRACT_LIMIT). Narrowing the range does not lift it. */
  errSelectionTooLarge: (triangles: number): string =>
    `Selection is too large — select fewer members (${formatNumber(triangles)} triangles).`,
  /* Engine guard (**after** cutting; MAX_TRIANGLES). No number is attached: the screen only holds the pre-cut count, which would be wrong. */
  errTooLarge: 'Too large to handle at once — narrow the range.',
  errEmpty: 'No surface to draw in the selected range.',
  /* When no layout fits on one sheet (A1 1:1000); engine error code `no_fit`. */
  errNoFit: 'The selection does not fit on one sheet — narrow the range or select fewer members.',
  errNoCandidate: 'Could not build any candidate.',
  errEngine: (message: string): string => `Could not build candidates (${message})`,

  // ---- Candidate cards ----
  cardMeta: (views: number, paper: string, denom: number): string => `${views} views · ${paper} 1:${denom}`,
  cardCoverage: (coverage: number, fill: number): string => `Covered ${coverage}% · Fill ${fill}%`,
  coverageTip: 'Share of the surface that faces at least one view head-on (within 60°) — an approximation that ignores occlusion',
  warnScaleSmall: 'Scale is small — narrow the range',
  engineStats: (triangles: number, ms: number): string => {
    const t = formatNumber(triangles);
    const s = (ms / 1000).toFixed(1);
    return `${t} triangles · ${s}s`;
  },

  // ---- Preview ----
  previewMark: 'PROPOSAL · Preview',
  previewHint: 'Wheel to zoom · drag to pan · double-click to reset',
  previewPickOne: 'Pick a candidate above to see it full size.',
  previewFrameError: 'Could not load the sheet frame',

  // ---- Title, note, save ----
  titleLabel: 'Title',
  noteLabel: 'Note',
  notePlaceholder: 'Optional',
  download: 'Download SVG',
  adopt: 'Adopt',
  adopting: 'Saving…',
  adopted: (title: string): string => `Saved as a proposal — ${title}`,
  errTitleEmpty: 'Enter a title.',
  errTitleTaken: (suggestion: string): string => `That title is already used — try “${suggestion}”.`,
  errDuplicateKey: 'That title is already used. Change the title and try again.',
  errNoBridge: 'Cannot save — the bridge record could not be loaded.',
  errSave: (message: string): string => `Could not save (${message})`,
  saveUnavailable: 'Not ready to save — this turns on once an administrator runs the SQL.',

  // ---- Existing sheets hint ----
  existingTitle: (n: number): string => `${n} existing sheets already cover this part (approximate)`,

  // ---- Saved proposal list ----
  listTitle: 'Saved Proposals',
  listEmpty: 'No proposals saved yet.',
  listLoading: 'Loading…',
  listError: (message: string): string => `Could not load the list (${message})`,
  statusProposed: 'Proposed',
  statusDiscarded: 'Discarded',
  discard: 'Discard',
  openedProposal: 'Saved proposal — read only',
  errOpenProposal: (message: string): string => `Could not open the proposal (${message})`,
  /* When a drawing or spec read back is not in the shape our engine emits; the reason shown in parentheses. */
  errInvalidProposal: 'the saved content is not in a valid format',
  errDiscard: (message: string): string => `Could not discard (${message})`,
} as const;

/** Composition names shown on the candidate cards and the saved list — the stored names of the bridge profile. */
export const COMPOSITION_NAME: Record<CompositionKey, string> = proposalProfile.compositionNames;
