import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { bridge } from '@/bridge';
import type {
  AashtoElementRow,
  BridgeSectionRow,
  DamagePosition,
  DamageWithDetails,
  ElementConditionRow,
  MemberRow,
  NbiComponentRow,
  ObjectElementRow,
  ObjectRow,
  ObjectSummaryRow,
  QuantityTableRow,
  SheetRow,
} from '@/types/db';

// ------------------------------------------------------------------
//  Supabase data hooks with the {data, loading, error} convention
//  + refetch (to refresh overlays and totals right after a registration).
// ------------------------------------------------------------------

interface Snapshot<T> {
  data: T[];
  loading: boolean;
  error: Error | null;
}

export interface QueryResult<T> extends Snapshot<T> {
  refetch: () => void;
}

interface SbResponse {
  data: unknown;
  error: { message: string } | null;
}

function useSbQuery<T>(fetcher: () => PromiseLike<SbResponse>): QueryResult<T> {
  const [state, setState] = useState<Snapshot<T>>({
    data: [],
    loading: true,
    error: null,
  });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    fetcher().then(
      ({ data, error }) => {
        if (!alive) return;
        if (error) {
          setState({ data: [], loading: false, error: new Error(error.message) });
        } else {
          setState({ data: (data ?? []) as T[], loading: false, error: null });
        }
      },
      (err: unknown) => {
        if (!alive) return;
        setState({
          data: [],
          loading: false,
          error: err instanceof Error ? err : new Error(String(err)),
        });
      },
    );
    return () => {
      alive = false;
    };
    // fetcher is a new reference on every render; rerun by nonce only (one-shot query pattern)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce]);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, refetch };
}

// ------------------------------------------------------------------
//  Query hooks
// ------------------------------------------------------------------

/**
 * Paged query of all rows. The PostgREST **server max-rows cap (1,000) cannot be exceeded by
 * asking for a larger range**: a single request silently truncates a table with more rows.
 * So 1,000-row pages are concatenated until a short page arrives. The sort key is stable
 * (explicit order), so there are no duplicates or gaps.
 */
const PAGE_ROWS = 1000;
async function fetchAllPages(
  page: (from: number, to: number) => PromiseLike<SbResponse>,
): Promise<SbResponse> {
  const all: unknown[] = [];
  for (let off = 0; ; off += PAGE_ROWS) {
    const { data, error } = await page(off, off + PAGE_ROWS - 1);
    if (error) return { data: null, error };
    const rows = (data ?? []) as unknown[];
    all.push(...rows);
    if (rows.length < PAGE_ROWS) return { data: all, error: null };
  }
}

/* objects, the object register, by object_code. Paged because of the server cap. */
export function useObjects(): QueryResult<ObjectRow> {
  return useSbQuery<ObjectRow>(() =>
    fetchAllPages((from, to) =>
      supabase.from('objects').select('*').order('object_code').range(from, to),
    ),
  );
}

/* v_object_summary: damage count and latest observation per object (same row scale as objects) */
export function useObjectSummary(): QueryResult<ObjectSummaryRow> {
  return useSbQuery<ObjectSummaryRow>(() =>
    fetchAllPages((from, to) =>
      supabase.from('v_object_summary').select('*').order('object_code').range(from, to),
    ),
  );
}

/* v_quantity_table: damage quantity table (latest observation first) */
export function useQuantityTable(): QueryResult<QuantityTableRow> {
  return useSbQuery<QuantityTableRow>(() =>
    supabase
      .from('v_quantity_table')
      .select('*')
      .order('observed_at', { ascending: false, nullsFirst: false }),
  );
}

/**
 * damages: the **current (active) damages only**, joined with their observation history and the label of the first round.
 * The tablet app marks a deleted damage with status = 'deleted' (soft delete). Those are left out here by the same rule
 * as the database views (v_element_condition and v_object_summary count status = 'active' only), so a deleted damage
 * shows neither as a marker nor in a list, and its photos are never asked for.
 */
export function fetchActiveDamages(): PromiseLike<SbResponse> {
  return supabase
    .from('damages')
    .select('*, damage_observations(*), inspections:first_inspection_id(round_label)')
    .eq('status', 'active')
    .order('created_at', { ascending: false });
}

/* damages joined with their observation history and the label of the first round (current damages only: fetchActiveDamages) */
export function useDamages(): QueryResult<DamageWithDetails> {
  return useSbQuery<DamageWithDetails>(fetchActiveDamages);
}

/* members, the member register */
export function useMembers(): QueryResult<MemberRow> {
  return useSbQuery<MemberRow>(() =>
    supabase.from('members').select('*').order('id'),
  );
}

/* sheets, the list of inspection sheets */
export function useSheets(): QueryResult<SheetRow> {
  return useSbQuery<SheetRow>(() =>
    supabase
      .from('sheets')
      .select('*')
      .order('sort_no', { ascending: true, nullsFirst: false }),
  );
}

/**
 * bridge_sections, the evaluation sections (this bridge has the single row 'main').
 *
 * NOTE: on a database without the table REST returns an error;
 *    it **falls back to an empty list** so it does not surface as a screen error. With an empty
 *    list everything belongs to the default section of the bridge profile.
 *
 * The section_id columns of sheets/objects keep select('*') for the same reason:
 *    naming a column in the select string gives a 400 on a database without the column,
 *    while '*' returns only existing columns and is safe either way.
 *    (The row types have section_id?: optional; types/db.ts)
 */
export function useBridgeSections(): QueryResult<BridgeSectionRow> {
  return useSbQuery<BridgeSectionRow>(async () => {
    const res = await supabase
      .from('bridge_sections')
      .select('*')
      .order('sort_no');
    if (res.error) {
      console.info(
        '[useBridgeSections] could not read bridge_sections — falling back to an empty list:',
        res.error.message,
      );
      return { data: [], error: null };
    }
    return res;
  });
}

// ------------------------------------------------------------------
//  AASHTO elements and condition states
//  Reference for the tables and views: db/schema.sql of the pipeline repository.
//  The query functions (fetch*) are exported separately from the hooks so they can be
//  tested with a fake client, without a renderer.
// ------------------------------------------------------------------

/* aashto_elements, the element library (MBEI 2019), by element_no */
export function fetchAashtoElements(): PromiseLike<SbResponse> {
  return supabase.from('aashto_elements').select('*').order('element_no');
}
export function useAashtoElements(): QueryResult<AashtoElementRow> {
  return useSbQuery<AashtoElementRow>(fetchAashtoElements);
}

/* object_elements, element quantity per object, by id. Grows with the object count, so paged like objects because of the server cap. */
export function fetchObjectElements(): Promise<SbResponse> {
  return fetchAllPages((from, to) =>
    supabase.from('object_elements').select('*').order('id').range(from, to),
  );
}
export function useObjectElements(): QueryResult<ObjectElementRow> {
  return useSbQuery<ObjectElementRow>(fetchObjectElements);
}

/* v_element_condition: total and CS1-CS4 per element (latest observation of active damages), by element_no */
export function fetchElementCondition(): PromiseLike<SbResponse> {
  return supabase.from('v_element_condition').select('*').order('element_no');
}
export function useElementCondition(): QueryResult<ElementConditionRow> {
  return useSbQuery<ElementConditionRow>(fetchElementCondition);
}

/**
 * v_nbi_components: NBI rating 0-9 per component (deck, super, sub).
 * The order follows the view definition (deck, super, sub); there is no sort key column, so no order is given (the screens look up by component).
 */
export function fetchNbiComponents(): PromiseLike<SbResponse> {
  return supabase.from('v_nbi_components').select('*');
}
export function useNbiComponents(): QueryResult<NbiComponentRow> {
  return useSbQuery<NbiComponentRow>(fetchNbiComponents);
}

// ------------------------------------------------------------------
//  Damage registration: inspections upsert, damages insert, observation insert
// ------------------------------------------------------------------

// The default inspection round of a registration is the bridge profile's roundLabel.

/* Gets the inspection for a round_label (reused when present, created otherwise). Without a round, the default round of the bridge profile. */
export async function ensureInspection(
  bridgeId: string,
  roundLabel: string = bridge.roundLabel,
): Promise<string> {
  const found = await supabase
    .from('inspections')
    .select('id')
    .eq('bridge_id', bridgeId)
    .eq('round_label', roundLabel)
    .maybeSingle();
  if (found.error) throw new Error(found.error.message);
  const foundId = (found.data as { id: string } | null)?.id;
  if (foundId) return foundId;

  const created = await supabase
    .from('inspections')
    .insert({ bridge_id: bridgeId, round_label: roundLabel })
    .select('id')
    .single();
  if (created.error) throw new Error(created.error.message);
  return (created.data as { id: string }).id;
}

export interface NewDamageInput {
  bridgeId: string;
  /* objects.id (uuid), obtained by matching object_code */
  objectId: string;
  /**
   * Damage type, stored as database `damages.fault_type` as is
   * (for an AASHTO damage, the defect name).
   *
   * NOTE: never put the damage name in fault_detail; that column means **location**.
   *   The tablet app reads fault_detail as the location, so a damage name written
   *   there by the web would show up in the location field of its detail view.
   */
  faultType: string;
  /* Click hit.point: GLB world coordinates as is */
  position: DamagePosition;
  widthMm: number | null;
  lengthM: number | null;
  /* Number of **locations** where the damage occurs (-> damage_observations.cnt) */
  cnt: number;
  /**
   * Count: the **number of damages** at that location, EA (-> damage_observations.quantity).
   * NOTE: the quantity column holds a count, not a measured quantity (m, sq m);
   *   the unit column is legacy and left alone.
   */
  quantity?: number | null;
  /* Letter grade. AASHTO observations leave it null; the state goes in conditionState. */
  grade: string | null;
  note: string;
  roundLabel?: string;
  // ---- AASHTO fields
  /* AASHTO defect number (-> damages.defect_no, aashto_defects.defect_no) */
  defectNo?: number | null;
  /* State CS1-CS4 (-> damage_observations.condition_state) */
  conditionState?: 1 | 2 | 3 | 4 | null;
  /* Quantity in that state, in the element unit (-> damage_observations.cs_quantity) */
  csQuantity?: number | null;
  /* Quantity unit 'sq ft', 'ft' or 'each' (-> damage_observations.cs_unit) */
  csUnit?: string | null;
}

/* Registers one damage + one observation. Returns the damage id on success. */
export async function registerDamage(input: NewDamageInput): Promise<string> {
  const inspectionId = await ensureInspection(
    input.bridgeId,
    input.roundLabel ?? bridge.roundLabel,
  );

  const dmg = await supabase
    .from('damages')
    .insert({
      bridge_id: input.bridgeId,
      object_id: input.objectId,
      first_inspection_id: inspectionId,
      fault_type: input.faultType,
      // fault_detail (= location) is left empty when registering from the web; the damage name is in fault_type.
      fault_detail: null,
      shape_kind: 'point',
      // position is passed through as received; no new keys are added (the {x,y,z,client_id,seq,sheet{...}} shape is kept).
      position: input.position,
      // AASHTO defect number
      defect_no: input.defectNo ?? null,
    })
    .select('id')
    .single();
  if (dmg.error) throw new Error(dmg.error.message);
  const damageId = (dmg.data as { id: string }).id;

  const obs = await supabase.from('damage_observations').insert({
    damage_id: damageId,
    inspection_id: inspectionId,
    width_mm: input.widthMm,
    length_m: input.lengthM,
    cnt: input.cnt, // number of locations
    quantity: input.quantity ?? null, // count (EA); the unit column is legacy and unused
    grade: input.grade,
    note: input.note.trim() || null,
    // AASHTO condition state and element quantity
    condition_state: input.conditionState ?? null,
    cs_quantity: input.csQuantity ?? null,
    cs_unit: input.csUnit ?? null,
  });
  if (obs.error) throw new Error(obs.error.message);

  return damageId;
}
