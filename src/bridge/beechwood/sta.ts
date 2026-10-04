// ------------------------------------------------------------------
//  Station and elevation labels: model coordinates (m) to US customary (ft) labels.
//
//  Coordinate definition (docs/dimensions.md section 5 of the pipeline repository):
//    z_m = (sta_ft - 10621) x 0.3048  : C Structure Sta. 106+21.00 is z = 0, +z = increasing station (north)
//    y_m = (El_ft - 400) x 0.3048     : EL 400 ft is y = 0
//    x_m = offset_ft x 0.3048         : +x = right when looking up-station (east)
//  Format: `STA 106+21.0` (100 ft stations + remainder, one decimal), `EL 428.4 ft`, ranges with an en dash (U+2013) between values.
//  Only narrowed axes appear, in z, y, x order; negatives keep the '-' of toFixed.
// ------------------------------------------------------------------
import type { ClipBox } from '@/lib/proposal/types';

/** 1 ft = 0.3048 m */
const FT = 0.3048;
/* Station at z = 0 (ft): C Structure Sta. 106+21.00 */
const STA_ORIGIN_FT = 10621;
/* Elevation at y = 0 (ft) */
const EL_ORIGIN_FT = 400;
/* Range separator: U+2013 EN DASH */
const RANGE = '–';

/* Station number only: `106+21.0`. Fixed to one decimal first so 99.96 cannot leak out as `+100.0`. */
function staValue(z: number): string {
  const v = Math.round((z / FT + STA_ORIGIN_FT) * 10) / 10;
  const sign = v < 0 ? '-' : '';
  const abs = Math.abs(v);
  const station = Math.floor(abs / 100);
  return `${sign}${station}+${(abs - station * 100).toFixed(1).padStart(4, '0')}`;
}

/* Elevation number only: `428.4`. */
function elValue(y: number): string {
  return (y / FT + EL_ORIGIN_FT).toFixed(1);
}

/* Offset number only (ft): `-10.0`. */
function xValue(x: number): string {
  return (x / FT).toFixed(1);
}

/* z (world, m) to `STA 106+21.0`. */
export function staLabel(z: number): string {
  return `STA ${staValue(z)}`;
}

/* y (world, m) to `EL 400.0 ft`. */
export function elLabel(y: number): string {
  return `EL ${elValue(y)} ft`;
}

/* x (world, m) to `x -5.0 ft`, the same value as x in a range label (clipLabels). */
export function xLabel(x: number): string {
  return `x ${xValue(x)} ft`;
}

/* Range labels of the narrowed axes, in z, y, x order. Uncut axes are left out. */
export function clipLabels(clip: ClipBox): string[] {
  const out: string[] = [];
  if (clip.z) out.push(`STA ${staValue(clip.z[0])}${RANGE}${staValue(clip.z[1])}`);
  if (clip.y) out.push(`EL ${elValue(clip.y[0])}${RANGE}${elValue(clip.y[1])} ft`);
  if (clip.x) out.push(`x ${xValue(clip.x[0])}${RANGE}${xValue(clip.x[1])} ft`);
  return out;
}
