// ------------------------------------------------------------------
//  Evaluation sections: one bridge, one section.
//  There is no reason to split the rules by section: the AASHTO elements and NBI component ratings
//  are one set for the whole bridge (src/lib/eval/aashto). The database bridge_sections table has the single row 'main'.
// ------------------------------------------------------------------
import { MAIN_SECTION_NAME } from './texts';

export const SECTIONS = [{ code: 'main', name: MAIN_SECTION_NAME }] as const;

/* Used when the section of something is unknown; with a single section it is always this one */
export const DEFAULT_SECTION_CODE = 'main';
