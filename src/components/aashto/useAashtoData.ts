// ------------------------------------------------------------------
//  Shared hook of the screens: queries object_elements and aashto_elements and derives values (data.ts deriveAashtoData).
//  The caller passes the objects and damages snapshots it already holds (so a table is not fetched twice).
// ------------------------------------------------------------------
import { useMemo } from 'react';
import { useAashtoElements, useObjectElements, type QueryResult } from '@/hooks/useSupabase';
import type { DamageWithDetails, ObjectRow } from '@/types/db';
import { deriveAashtoData, type AashtoData } from './data';

export interface AashtoDataState extends AashtoData {
  loading: boolean;
  error: Error | null;
}

export function useAashtoData(
  objects: QueryResult<ObjectRow>,
  damages: QueryResult<DamageWithDetails>,
): AashtoDataState {
  const objectElements = useObjectElements();
  const elements = useAashtoElements();
  const data = useMemo(
    () =>
      deriveAashtoData({
        objects: objects.data,
        damages: damages.data,
        objectElements: objectElements.data,
        elements: elements.data,
      }),
    [objects.data, damages.data, objectElements.data, elements.data],
  );
  return {
    ...data,
    loading: objects.loading || damages.loading || objectElements.loading || elements.loading,
    error: objects.error ?? damages.error ?? objectElements.error ?? elements.error,
  };
}
