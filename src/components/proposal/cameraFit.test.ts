// ------------------------------------------------------------------
//  Automatic fit policy: the camera is fitted once, when a part is first resolved after entering the page.
//  After that it moves only when the user presses "Fit selection".
// ------------------------------------------------------------------
import { describe, expect, it } from 'vitest';
import { autoFitDecision } from './cameraFit';

describe('autoFitDecision', () => {
  it('fits once when a part is first resolved', () => {
    expect(autoFitDecision(false, true)).toEqual({ fit: true, fittedOnce: true });
  });

  it('with an empty selection (no part resolved) neither fits nor uses up the chance', () => {
    expect(autoFitDecision(false, false)).toEqual({ fit: false, fittedOnce: false });
  });

  it('does not fit again after the first fit even when the selection changes', () => {
    expect(autoFitDecision(true, true)).toEqual({ fit: false, fittedOnce: true });
    expect(autoFitDecision(true, false)).toEqual({ fit: false, fittedOnce: true });
  });

  it('meshes that arrive late: fits at the first moment a part is resolved', () => {
    // Entering with ?ids= for a lazily loaded span, there are no bounds until its model arrives, so the chance is kept.
    let fittedOnce = false;
    const seq: boolean[] = [];
    for (const hasBounds of [false, false, true, true, false, true]) {
      const d = autoFitDecision(fittedOnce, hasBounds);
      fittedOnce = d.fittedOnce;
      seq.push(d.fit);
    }
    expect(seq).toEqual([false, false, true, false, false, false]);
  });
});
