// ------------------------------------------------------------------
//  Stored-value rules of the sheet proposal engine — the light module the engine (worker) imports.
//
//  Always the same object as bridge.proposal (index.test.ts). The engine does not import the whole
//  profile (src/bridge/index.ts) so the worker bundle does not carry the tree builder and screen texts.
// ------------------------------------------------------------------
import { beechwoodProposal } from './beechwood/proposal';
import type { ProposalProfile } from './types';

export const proposalProfile: ProposalProfile = beechwoodProposal;
