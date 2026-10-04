// ------------------------------------------------------------------
//  Frame asset paths of the sheet proposal screen, taken from frames.templates of the bridge profile.
// ------------------------------------------------------------------
import { describe, expect, it } from 'vitest';
import { frameUrls } from './useFrameAssets';

const base = import.meta.env.BASE_URL;

describe('frameUrls: kind to template and metrics URLs', () => {
  it('bw: the frame and its metrics file', () => {
    expect(frameUrls('bw')).toEqual({ svg: `${base}proposal/frame_bw.svg`, meta: `${base}proposal/frame_bw_meta.json` });
  });

  it('a kind missing from the profile gives null, so no missing file is requested', () => {
    expect(frameUrls('nope')).toBeNull();
  });
});
