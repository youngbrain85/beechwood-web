// Key facts of one damage shown beside its photos when a row of the sheet damage table is opened.
import { describe, expect, it } from 'vitest';
import type { DamageWithDetails } from '@/types/db';
import { damageInfoItems } from './damageInfo';

const damage = (p: Partial<DamageWithDetails>): DamageWithDetails =>
  ({
    id: 'd1',
    fault_type: 'Delamination/Spall/Patched Area',
    fault_detail: 'West face, 0.25 L from Bent 2',
    repair_method: null,
    created_at: '2026-09-21T13:20:00+00:00',
    inspections: { round_label: '2026-09' },
    damage_observations: [
      { id: 'o1', observed_at: '2026-09-21T13:20:00+00:00' },
      { id: 'o2', observed_at: '2026-10-02T08:00:00+00:00' },
    ],
    ...p,
  }) as unknown as DamageWithDetails;

describe('damageInfoItems', () => {
  it('lists object code, round, observation count, latest observation, location, repair method and registration day', () => {
    expect(damageInfoItems(damage({}), 'BW_BEAM_B2')).toEqual([
      ['Object Code', 'BW_BEAM_B2'],
      ['Round', '2026-09'],
      ['Observations', '2'],
      ['Last Observed', '2026-10-02'],
      ['Location', 'West face, 0.25 L from Bent 2'],
      ['Repair Method', '—'],
      ['Registered On', '2026-09-21'],
    ]);
  });

  it('shows a dash for every missing value', () => {
    const d = damage({ fault_detail: '  ', created_at: null as unknown as string, inspections: null, damage_observations: [] });
    expect(damageInfoItems(d, '').map(([, v]) => v)).toEqual(['—', '—', '0', '—', '—', '—', '—']);
  });

  it('shows the repair method when there is one', () => {
    expect(damageInfoItems(damage({ repair_method: 'Patch' }), 'X').find(([k]) => k === 'Repair Method')).toEqual(['Repair Method', 'Patch']);
  });
});
