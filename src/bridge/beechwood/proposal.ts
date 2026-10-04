// ------------------------------------------------------------------
//  Stored-value rules of sheet proposals (stored values in the database are English).
//
//  Title: `Deck slab (BW_DECK_B, STA 105+76.0-106+66.0) - Face-by-Face Development` (with en and em dashes)
//    - one space + parentheses after the fine member
//    - station and elevation in the bridge's format (sta.ts: ft, en dash between values)
//    - 2-3 codes give `first-last` (en dash, like the range format), 4 or more give `first + N more`
//  Composition names: the same words the screen shows (i18n/s.proposal.ts COMPOSITION_NAME); here they are stored values.
//  When the fine member cannot be decided: 'Other' (the word objects.ts gives an id outside the grammar).
//  View labels follow the bridge orientation (+z = increasing station = north, +x = east): the six axes are Top/Soffit/West, East, South, North face;
//  the four quadrants of a cylinder (perpendicular to the axis) are [-z, +x, +z, -x] = Front face, East face, Back face, West face;
//  inclined face n gives Inclined face n and quadrant n gives Quadrant n.
//  The proposal engine (worker) takes only this through src/bridge/proposal.ts, so imports are kept light.
// ------------------------------------------------------------------
import type { ViewLabelSet } from '@/lib/proposal/basis';
import { naturalCompare, type TitleFormat } from '@/lib/proposal/title';
import type { CompositionKey } from '@/lib/proposal/types';
import type { ProposalProfile } from '../types';
import { clipLabels } from './sta';

/**
 * Stored bridge name: the formal name (INDOT Des 1400825), the same value as bridge in the pipeline's
 * sheets_index.json and database bridges.name. The display name is BridgeProfile.name ('Beechwood Bridge').
 */
export const STORED_NAME = 'Beechwood Rd over Little Blue River';

/* Composition names: stored values that go into titles */
export const COMPOSITION_NAMES: Record<CompositionKey, string> = {
  single: 'Single Main Face',
  development: 'Face-by-Face Development',
  three_view: 'Three-View',
  four_side: 'Four-Side Development',
  cylinder: 'Cylinder Development (4 Quadrants)',
};

/* Separator of a code range: U+2013 EN DASH (the same as the range format in sta.ts) */
const RANGE = '–';

/* Object code group: one as is, 2-3 as first-last, 4 or more as `first + N more` (after natural sorting). */
function codeLabel(codes: string[]): string {
  const sorted = [...codes].sort(naturalCompare);
  if (sorted.length <= 1) return sorted[0] ?? '';
  if (sorted.length <= 3) return `${sorted[0]}${RANGE}${sorted[sorted.length - 1]}`;
  return `${sorted[0]} + ${sorted.length - 1} more`;
}

export const titleFormat: TitleFormat = {
  clipLabels,
  codeLabel,
  head: (fine, inside) => (inside ? `${fine} (${inside})` : fine),
};

/* Proposal view labels: stored values (ViewSpec.label). For the order convention see basis.ts ViewLabelSet */
export const VIEW_LABELS: ViewLabelSet = {
  axes: ['Top', 'Soffit', 'West face', 'East face', 'South face', 'North face'],
  oblique: (n) => `Inclined face ${n}`,
  cylinder: ['Front face', 'East face', 'Back face', 'West face'],
  quadrants: ['Quadrant 1', 'Quadrant 2', 'Quadrant 3', 'Quadrant 4'],
};

export const beechwoodProposal: ProposalProfile = {
  storedName: STORED_NAME,
  title: titleFormat,
  compositionNames: COMPOSITION_NAMES,
  fallbackFine: 'Other',
  viewLabels: VIEW_LABELS,
};
