// ------------------------------------------------------------------
//  Active bridge profile — this repository carries one implementation (Beechwood).
//  The BridgeProfile interface stays so the screens keep reading bridge facts from one place.
// ------------------------------------------------------------------
import { beechwoodProfile } from './beechwood';
import type { BridgeProfile } from './types';

export type { BridgeCode, BridgeProfile, FrameTemplate, ProposalProfile, SectionTree } from './types';

export const bridge: BridgeProfile = beechwoodProfile;
