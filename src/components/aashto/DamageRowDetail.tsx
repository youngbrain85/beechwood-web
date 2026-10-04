// ------------------------------------------------------------------
//  Content of an opened row of the sheet damage table: the photos of that damage + its key facts
//  (damageInfo.ts). The photo block is read only.
// ------------------------------------------------------------------
import { Fragment } from 'react';
import { Text } from '@mantine/core';
import { DamagePhotos } from '@/components/DamagePhotos';
import type { DamageWithDetails } from '@/types/db';
import { damageInfoItems } from './damageInfo';

export function DamageRowDetail({
  damage,
  objectCode,
  onLightboxChange,
}: {
  damage: DamageWithDetails;
  objectCode: string;
  /* Passed on to DamagePhotos: the sheet modal must not close on the Esc that closes the enlarged photo. */
  onLightboxChange?: (open: boolean) => void;
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
      {/* contain: inline-size keeps the summed thumbnail width from widening the table (the row scrolls sideways instead) */}
      <div style={{ flex: '1 1 360px', minWidth: 0, contain: 'inline-size' }}>
        <DamagePhotos damage={damage} thumbW={160} thumbH={120} onLightboxChange={onLightboxChange} />
      </div>
      <div
        data-testid="damage-info"
        style={{ flex: '0 1 300px', display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 12, rowGap: 4 }}
      >
        {damageInfoItems(damage, objectCode).map(([label, value]) => (
          <Fragment key={label}>
            <Text fz={12} c="dimmed">
              {label}
            </Text>
            <Text fz={12} className="tnum">
              {value}
            </Text>
          </Fragment>
        ))}
      </div>
    </div>
  );
}
