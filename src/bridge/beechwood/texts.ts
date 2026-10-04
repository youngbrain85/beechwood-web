// ------------------------------------------------------------------
//  Display texts.
//  Stored values (database) are English too, so they are shown without a translation layer.
//  The member, fine member and location vocabulary is tied to the id grammar and lives in objects.ts and tree.ts.
// ------------------------------------------------------------------
import type { BridgeProfile } from '../types';

/* Bridge name */
export const BRIDGE_NAME = 'Beechwood Bridge';
/* Bridge subtitle (hero, dashboard): formal name and location (INDOT Des. No. 1400825) */
export const BRIDGE_SUB = 'Beechwood Rd over Little Blue River · Crawford County, Indiana';
/* Name of the single evaluation section */
export const MAIN_SECTION_NAME = 'Main Bridge';

export const texts: BridgeProfile['texts'] = {
  bridgeName: BRIDGE_NAME,
  bridgeSub: BRIDGE_SUB,
  sectionNames: { main: MAIN_SECTION_NAME },
  // Sheet families (zone_type) are the stored names (the seven member names), shown as is
  familyName: (zone) => zone,
};
