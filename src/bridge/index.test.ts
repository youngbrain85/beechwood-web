// Active bridge profile — one implementation (Beechwood).
import { describe, expect, it } from 'vitest';
import { bridge } from './index';
import { proposalProfile } from './proposal';
import { beechwoodProfile } from './beechwood';

describe('active bridge profile', () => {
  it('bridge is the Beechwood profile itself', () => {
    expect(bridge.code).toBe('beechwood');
    expect(bridge).toBe(beechwoodProfile);
  });
});

// The proposal engine (worker) picks the proposal rules from a light module (src/bridge/proposal.ts)
// instead of the whole profile. It must always be the active profile's own object.
describe('proposal rules — the active profile\'s proposal itself', () => {
  it('proposalProfile === bridge.proposal, same stored bridge name', () => {
    expect(proposalProfile).toBe(bridge.proposal);
    expect(proposalProfile.storedName).toBe(bridge.storedName);
  });

  it('stored bridge name — the official English name', () => {
    expect(bridge.storedName).toBe('Beechwood Rd over Little Blue River');
  });
});

describe('default inspection round label — active profile', () => {
  it('the seeded round 2026-09', () => {
    expect(bridge.roundLabel).toBe('2026-09');
  });

  it('proposal view labels are the active profile\'s — the engine (worker) receives them through proposalProfile', () => {
    expect(proposalProfile.viewLabels).toBe(bridge.proposal.viewLabels);
    expect(proposalProfile.viewLabels.axes[0]).toBe('Top');
  });
});
