// ------------------------------------------------------------------
//  Key facts of one damage (pure): the label and value pairs shown beside the photos when a row of
//  the sheet damage table is opened. Defect, condition state, quantity and notes are already in the
//  row itself, so they are not repeated here.
// ------------------------------------------------------------------
import { latestObservation } from '@/lib/eval/aashto';
import type { DamageWithDetails } from '@/types/db';

const DASH = '—';
const day = (iso: string | null | undefined): string => (iso ? iso.slice(0, 10) : DASH);

/* [label, value] pairs in display order; a missing value is a dash */
export function damageInfoItems(damage: DamageWithDetails, objectCode: string): Array<[string, string]> {
  const obs = damage.damage_observations ?? [];
  return [
    ['Object Code', objectCode || DASH],
    ['Round', damage.inspections?.round_label || DASH],
    ['Observations', String(obs.length)],
    ['Last Observed', day(latestObservation(obs)?.observed_at)],
    ['Location', damage.fault_detail?.trim() || DASH],
    ['Repair Method', damage.repair_method?.trim() || DASH],
    ['Registered On', day(damage.created_at)],
  ];
}
