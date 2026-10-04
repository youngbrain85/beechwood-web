// ------------------------------------------------------------------
//  Sheet proposals (sheet_proposals): adopts candidates of the proposal engine (lib/proposal/engine.ts)
//  and saves, lists and discards them.
//
//  Follows the {data,loading,error,refetch} convention (QueryResult) of hooks/useSupabase.ts, plus an
//  available flag so the screen does not break on a database where the table does not exist yet
//  (before the migration). useSbQuery is a private helper of that file, so the query is
//  implemented here (the same "empty list when the table is missing" fallback as
//  useBridgeSections).
// ------------------------------------------------------------------
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { isTrustedDrawing } from '@/lib/proposal/drawing';
import { naturalCompare } from '@/lib/proposal/title';
import type { Candidate } from '@/lib/proposal/engine';
import type { ClipBox } from '@/lib/proposal/types';
import { ENGINE_VERSION } from '@/lib/proposal/types';
import { SProposal } from '@/i18n/s.proposal';
import type { SheetProposalRow } from '@/types/db';
import type { QueryResult } from './useSupabase';

/**
 * How PostgREST reports "no such table"; the same test as the useBridgeSections fallback.
 * Both the code (PGRST205) and the message text (not in the schema cache / does not
 * exist) are checked; either arrives in the single message string.
 */
export function isMissingTable(message: string): boolean {
  return (
    message.includes('PGRST205') ||
    message.includes('Could not find the table') ||
    message.includes('does not exist') ||
    message.includes('schema cache')
  );
}

// drawing_svg is hundreds of KB per row, so the list query leaves it out.
// selection is left out too: the screen does not read it and mesh_names can be long.
export const LIST_COLUMNS =
  'id,bridge_id,section_id,member_id,title,status,composition,spec,note,engine_version,created_by,created_at,updated_at';

interface Snapshot {
  data: SheetProposalRow[];
  loading: boolean;
  error: Error | null;
  available: boolean;
}

/**
 * Saved proposals (latest first). When the table does not exist (before the migration) it falls
 * back to available=false and an empty list (so it does not surface as a screen error).
 */
export function useSheetProposals(): QueryResult<SheetProposalRow> & { available: boolean } {
  const [state, setState] = useState<Snapshot>({ data: [], loading: true, error: null, available: true });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    supabase
      .from('sheet_proposals')
      .select(LIST_COLUMNS)
      .order('created_at', { ascending: false })
      .then(
        (res: { data: unknown; error: { message: string } | null }) => {
          if (!alive) return;
          if (res.error) {
            if (isMissingTable(res.error.message)) {
              setState({ data: [], loading: false, error: null, available: false });
            } else {
              setState({ data: [], loading: false, error: new Error(res.error.message), available: true });
            }
            return;
          }
          setState({ data: (res.data ?? []) as SheetProposalRow[], loading: false, error: null, available: true });
        },
        (err: unknown) => {
          if (!alive) return;
          setState({
            data: [],
            loading: false,
            error: err instanceof Error ? err : new Error(String(err)),
            available: true,
          });
        },
      );
    return () => {
      alive = false;
    };
    // fetcher is a new reference on every render; rerun by nonce only (the same one-shot query pattern as useSupabase.useSbQuery)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce]);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, refetch };
}

// ------------------------------------------------------------------
//  Adoption precondition: the screen (routes/Proposals.tsx) uses the same test to disable the button
//  and at the start of adopt(). A pure function, so it is tested here.
// ------------------------------------------------------------------

/* Engine status; the same values as status of hooks/useProposalEngine.ts. */
export type EngineStatus = 'idle' | 'running' | 'done' | 'error';

/**
 * Whether a candidate can be adopted.
 *
 * Why `status === 'done'` is required: while running, the **previous** candidates stay on screen
 * (useProposalEngine keeps them to avoid flicker). Adopting then would save the previous
 * candidate's spec and drawing; for a large selection that window lasts tens of seconds.
 */
export function canAdopt(a: {
  active: Candidate | null;
  status: EngineStatus;
  available: boolean;
}): boolean {
  return a.active !== null && a.status === 'done' && a.available;
}

/**
 * The selection to save, taken from the **candidate's own record** (spec.zone).
 * The screen's selected and clip may already have changed into the input of the next run.
 */
export function adoptZone(c: Candidate): { objectCodes: string[]; clip: ClipBox } {
  return { objectCodes: [...c.spec.zone.objects], clip: c.spec.zone.clip };
}

export interface SaveProposalInput {
  bridgeId: string;
  sectionId: string | null;
  memberId: number | null;
  /* The title the user finally confirmed (may differ from the engine's suggested spec.title). */
  title: string;
  note: string;
  candidate: Candidate;
  objectCodes: string[];
  clip: ClipBox;
  /**
   * The meshes given to the engine; only their names are used.
   * Only the web code knows how selection keys (virtual keys included) resolve to meshes.
   * A later sheet builder needs the **resolved mesh names** to reproduce the same drawing, so they
   * are stored together with the codes.
   */
  meshes: ReadonlyArray<{ name: string }>;
}

/* The stored selection: what was chosen (codes, meshes) and how much was processed (count, triangles). */
function buildSelection(a: SaveProposalInput): Record<string, unknown> {
  return {
    object_codes: a.objectCodes,
    clip: a.clip,
    mesh_names: [...new Set(a.meshes.map((m) => m.name))].sort(naturalCompare),
    mesh_count: a.meshes.length,
    // Real amount processed after cutting, bolts excluded; differs from the screen's selected triangle count (before cutting).
    triangles: a.candidate.metrics.triangles,
  };
}

/* Adopt: saves one candidate as one sheet_proposals row and returns the new id. */
export async function saveProposal(a: SaveProposalInput): Promise<string> {
  const res = await supabase
    .from('sheet_proposals')
    .insert({
      bridge_id: a.bridgeId,
      section_id: a.sectionId,
      member_id: a.memberId,
      title: a.title,
      composition: a.candidate.key,
      selection: buildSelection(a),
      // spec.title of the stored value is the final title the user edited, not the one the engine first suggested.
      spec: { ...a.candidate.spec, title: a.title },
      drawing_svg: a.candidate.drawing,
      note: a.note.trim() || null,
      engine_version: ENGINE_VERSION,
      // status, created_by, created_at, updated_at and id are database defaults and are not sent here.
    })
    .select('id')
    .single();
  if (res.error) throw new Error(res.error.message);
  return (res.data as { id: string }).id;
}

/* Discard: only changes status so the row leaves the list and the title uniqueness check (the row stays). */
export async function discardProposal(id: string): Promise<void> {
  const res = await supabase.from('sheet_proposals').update({ status: 'discarded' }).eq('id', id);
  if (res.error) throw new Error(res.error.message);
}

/**
 * Reads the single drawing_svg left out of the list query when a sheet is opened.
 *
 * A drawing read here **must be validated** before it reaches the screen: the composed result goes into
 * dangerouslySetInnerHTML, and with a row-level policy granting every signed-in user full access the row may not be ours.
 */
export async function fetchProposalDrawing(id: string): Promise<string> {
  const res = await supabase.from('sheet_proposals').select('drawing_svg').eq('id', id).single();
  if (res.error) throw new Error(res.error.message);
  const svg = (res.data as { drawing_svg?: string } | null)?.drawing_svg;
  // These messages are shown as is, in parentheses, when a proposal cannot be opened.
  if (!svg)
    throw new Error(
      `sheet_proposals ${id}: drawing_svg not found.`,
    );
  if (!isTrustedDrawing(svg)) throw new Error(`sheet_proposals ${id}: ${SProposal.errInvalidProposal}`);
  return svg;
}
