// ------------------------------------------------------------------
//  Bridge profile (Beechwood Road over Little Blue River, Indiana).
// ------------------------------------------------------------------
import type { BridgeProfile, SectionTree } from '../types';
import { familiesFor } from './families';
import { frames } from './frames';
import { objectInfo } from './objects';
import { beechwoodProposal, STORED_NAME } from './proposal';
import { DEFAULT_SECTION_CODE, SECTIONS } from './sections';
import { clipLabels, elLabel, staLabel, xLabel } from './sta';
import { BRIDGE_NAME, MAIN_SECTION_NAME, texts } from './texts';
import { buildTree } from './tree';

/**
 * Default inspection round of the damage form: the seeded round (database inspections.round_label, db/seed_beechwood.py).
 * A stored value. Change it here once a round scheme is settled.
 */
export const ROUND_LABEL = '2026-09';

/* Section trees: the main bridge is the only section, so the whole tree belongs to it */
function trees(objectIds: string[]): SectionTree[] {
  return [{ section: DEFAULT_SECTION_CODE, label: MAIN_SECTION_NAME, nodes: buildTree(objectIds) }];
}

export const beechwoodProfile: BridgeProfile = {
  code: 'beechwood',
  name: BRIDGE_NAME,
  storedName: STORED_NAME,
  model: { manifestUrl: '/models3d/beechwood/manifest.json' },
  sheetsBase: '/sheets-beechwood/',
  sections: SECTIONS,
  defaultSectionCode: DEFAULT_SECTION_CODE,
  roundLabel: ROUND_LABEL,
  objectInfo,
  buildTree,
  trees,
  familiesFor,
  sta: { label: staLabel, el: elLabel, x: xLabel, clipLabels },
  frames,
  texts,
  proposal: beechwoodProposal,
};
