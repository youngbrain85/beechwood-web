// ------------------------------------------------------------------
//  Sheet proposal frame: a single template kind ('bw').
//  The bridge is short (252 ft, three spans), so one KEY PLAN covers its whole length and there is
//  no need to pick a frame by the selected position (z): every range uses 'bw'.
//  The template and metrics are made by the pipeline (mangdo/frame_bw.svg, mangdo/frame_bw_meta.json)
//  and copied to public/proposal/ by scripts/beechwood/sync-sheets.mjs.
// ------------------------------------------------------------------
import type { BridgeProfile } from '../types';

export const frames: BridgeProfile['frames'] = {
  kindFor: () => 'bw',
  templates: {
    bw: { svg: '/proposal/frame_bw.svg', meta: '/proposal/frame_bw_meta.json' },
  },
};
