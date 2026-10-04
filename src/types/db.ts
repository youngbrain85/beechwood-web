// ------------------------------------------------------------------
//  Row types of the Supabase schema.
//  uuid is a string, timestamp an ISO string; for the jsonb position see below.
//  Schema reference: db/schema.sql of the pipeline repository.
// ------------------------------------------------------------------
import type { ProposalSpec } from '@/lib/proposal/engine';
import type { ClipBox } from '@/lib/proposal/types';

/* damages.position (jsonb): GLB world coordinates as is (m, Y-up). */
export interface DamagePosition {
  x: number;
  y: number;
  z: number;
  /* Damage number within the sheet (from 1, gaps allowed): the reference number shared by the drawn damage and the quantity table */
  seq?: number;
  /* Original sheet input of the tablet app: view-normalized (u,v) + stroke paths (to reproduce the 2D overlay) */
  sheet?: {
    id?: string;
    title?: string;
    view?: string;
    u?: number;
    v?: number;
    path?: Array<[number, number]>;
    closed?: boolean;
    /* Legacy data: rectangular area [u0,v0,u1,v1] (rendered as a glyph marker) */
    rect?: [number, number, number, number];
  };
  /* Surface normal of the member (for the marker offset, optional) */
  normal?: [number, number, number];
  /* World polyline of a stroke/polygon damage (optional) */
  path?: Array<{ x: number; y: number; z: number }>;
}

export type ShapeKind = 'point' | 'stroke' | 'polygon';

// ---- Tables -------------------------------------------------------

export interface BridgeRow {
  id: string;
  code: string;
  name: string;
  bridge_type: string;
  length_m: number | null;
  location: string | null;
  created_at: string;
}

export interface MemberRow {
  id: number;
  bridge_type: string;
  category: string;
  name: string;
  weight: number;
}

export interface ObjectRow {
  id: string;
  bridge_id: string;
  object_code: string;
  member_id: number | null;
  group_code: string;
  name: string;
  el_range: string | null;
  glb_file: string | null;
  /**
   * Evaluation section FK (bridge_sections.id).
   * NOTE: optional so that a database without the column still works:
   *    with select('*') the field is simply absent, and the screens
   *    fall back to the default section of the bridge profile.
   */
  section_id?: string | null;
}

/* sheets.zone_spec.views[]: the 2D-3D view contract (only the fields the viewer needs are typed) */
export interface SheetViewSpec {
  id: string;
  label?: string;
  /* Canvas-normalized placement [px, py, pw, ph] (0..1, from the top left) */
  placement: [number, number, number, number];
  // ---- View plane (values the sheet generator records alongside), read by the "existing sheets" hint.
  //      All optional: old rows and partial specs must still fit, and the reader
  //      (lib/proposal/existing.existingSheetsFromRows) checks the shape again.
  origin?: [number, number, number];
  u?: [number, number, number];
  v?: [number, number, number];
  /* Outward direction of the surface. When absent the reader uses cross(u,v). */
  normal?: [number, number, number];
  extent_m?: [number, number];
  /* The range this view cuts to (given axes only); more exact than a fixed depth window. */
  clip?: Partial<Record<'x' | 'y' | 'z', [number, number]>>;
}
export interface SheetZoneSpec {
  /* Path of the web copy of the SVG */
  svg?: string;
  /* Sheet identifier: an ASCII key shared by the generator, the tablet app bundle and the web */
  sheet_id?: string;
  canvas_mm?: [number, number];
  views?: SheetViewSpec[];
}

export interface SheetRow {
  id: string;
  bridge_id: string;
  member_id: number | null;
  title: string;
  sort_no: number | null;
  /**
   * Sheet family = family of the sheet JSON (for this bridge, one of the seven member names).
   * Not necessarily 1:1 with members.name.
   */
  zone_type: string | null;
  zone_spec: SheetZoneSpec | null;
  /**
   * Evaluation section FK (bridge_sections.id).
   * NOTE: optional so that a database without the column still works; when absent the
   *    screens fall back to the default section of the bridge profile.
   */
  section_id?: string | null;
}

/**
 * bridge_sections: evaluation sections. The bridge stays one row; a section only
 * selects the rating rules that apply to it (this bridge has the single section 'main').
 * On a database without the table the query hook (useBridgeSections) falls back to an empty list.
 */
export interface BridgeSectionRow {
  id: string;
  bridge_id: string;
  /* Section code ('main' for this bridge) */
  code: string;
  name: string;
  sort_no: number;
  /* Key of the rating rules that apply to the section */
  weight_scheme: string;
  note: string | null;
  created_at: string;
}

export interface InspectionRow {
  id: string;
  bridge_id: string;
  round_label: string;
  started_at: string | null;
}

export interface DamageRow {
  id: string;
  bridge_id: string;
  object_id: string | null;
  sheet_id: string | null;
  first_inspection_id: string | null;
  fault_type: string;
  fault_detail: string | null;
  shape_kind: ShapeKind | string;
  position: DamagePosition | null;
  photo_url: string | null;
  repair_method: string | null;
  status: string;
  created_at: string;
  /**
   * AASHTO defect number (a foreign key in spirit, aashto_defects.defect_no).
   * NOTE: optional so that a database without the column still works;
   * with select('*') the field is simply absent (as with ObjectRow.section_id).
   */
  defect_no?: number | null;
}

export interface DamageObservationRow {
  id: string;
  damage_id: string;
  inspection_id: string | null;
  width_mm: number | null;
  length_m: number | null;
  cnt: number | null;
  quantity: number | null;
  unit: string | null;
  grade: string | null;
  note: string | null;
  observed_at: string | null;
  /**
   * The three fields below are for AASHTO/NBI observations; they hold the same values as ConditionState (1-4) and
   * Observation.quantity/unit of lib/eval/aashto.
   * NOTE: optional so that a database without the columns still works (the fields are then absent).
   * The literals are copied here instead of importing ConditionState from lib/eval/aashto/types.ts
   * (that module is not imported from outside its folder).
   */
  condition_state?: 1 | 2 | 3 | 4 | null;
  cs_quantity?: number | null;
  cs_unit?: string | null;
}

/* Result of the useDamages() join: damages + observation history + label of the first round */
export interface DamageWithDetails extends DamageRow {
  damage_observations: DamageObservationRow[];
  inspections: { round_label: string } | null;
}

// ---- AASHTO elements / defects / condition states ----------------------------------
// The five below are types only (no run-time code here). The reference is db/schema.sql of the
// pipeline repository (tables aashto_elements, aashto_defects and object_elements, views
// v_element_condition and v_nbi_components); for the pure functions and the values themselves
// (ELEMENTS/DEFECTS and so on) see lib/eval/aashto/. That module is not imported here
// (no imports from outside its folder), so literal unions are copied as far as needed.

/* aashto_elements: one row of the AASHTO element reference table. Same shape as ElementDef of lib/eval/aashto. */
export interface AashtoElementRow {
  element_no: number;
  name: string;
  unit: 'sq ft' | 'ft' | 'each';
  category: 'deck' | 'super' | 'sub' | 'other';
}

/* aashto_defects: one row of the AASHTO defect reference table. cs2-cs4 = short description per condition state. */
export interface AashtoDefectRow {
  defect_no: number;
  name: string;
  applies_to: Array<'deck' | 'super' | 'sub' | 'other'>;
  cs2: string;
  cs3: string;
  cs4: string;
}

/* object_elements: one row of the element quantity inventory per object (member instance). */
export interface ObjectElementRow {
  id: number;
  object_id: string;
  element_no: number;
  quantity: number;
  unit: string;
  note: string | null;
}

// ---- Views -----------------------------------------------------------

/* v_object_summary: damage count, worst grade and latest observation per object */
export interface ObjectSummaryRow {
  object_id: string;
  bridge_id: string;
  object_code: string;
  member: string | null;
  damage_count: number;
  worst_grade: string | null;
  last_observed: string | null;
}

/* v_quantity_table: damage quantity table (round/object/member/damage/size/quantity/repair/grade) */
export interface QuantityTableRow {
  bridge_id: string;
  sheet_id: string | null;
  object_id: string | null;
  round_label: string | null;
  object_code: string | null;
  member: string | null;
  damage_desc: string | null;
  width_mm: number | null;
  length_m: number | null;
  cnt: number | null;
  quantity: number | null;
  unit: string | null;
  repair_method: string | null;
  grade: string | null;
  observed_at: string | null;
}

/**
 * v_element_condition: one row per element with the total, the CS1-CS4 sums and the element rating.
 * No bridge_id (the view lists all of aashto_elements; this project has a single bridge).
 * Same values as ElementCondition of lib/eval/aashto, but the column is named total_qty (not total).
 * rating (the last column) = the element's own ladder rating 0-9: share = CS quantity / that element's total (lib/eval/aashto elementRating).
 */
export interface ElementConditionRow {
  element_no: number;
  name: string;
  unit: 'sq ft' | 'ft' | 'each';
  category: 'deck' | 'super' | 'sub' | 'other';
  total_qty: number;
  cs1: number;
  cs2: number;
  cs3: number;
  cs4: number;
  rating: number;
}

/**
 * v_nbi_components: one row with the NBI rating per component (deck/super/sub).
 * No bridge_id (the 'other' component has no row at all; the UI shows N/A). Two columns only: rating = minimum rating of
 * that component's elements (total > 0), or 9 with nothing to rate (lib/eval/aashto componentRating). Quantities of elements
 * with different units are never added, so the view has no component total or share columns.
 */
export interface NbiComponentRow {
  component: 'deck' | 'super' | 'sub';
  rating: number;
}

// ---- Sheet proposals (adopted results of the proposal engine) -------------------------------

/**
 * sheet_proposals: one candidate of the proposal engine (lib/proposal/engine.ts) that the user
 * adopted and saved. On a database without the table the query hook
 * (hooks/useProposals.ts useSheetProposals) falls back to available=false.
 */
export interface SheetProposalRow {
  id: string;
  bridge_id: string;
  section_id: string | null;
  member_id: number | null;
  title: string;
  status: 'proposed' | 'discarded';
  composition: string;
  /**
   * What was chosen. **Left out of the list query** (the screen does not read it and mesh_names can be long).
   * mesh_names are the real mesh names the web's selection keys (virtual keys included) resolve to;
   * only the web code knows that mapping, so a later sheet builder needs them stored here.
   */
  selection?: {
    object_codes: string[];
    clip: ClipBox;
    mesh_names: string[];
    mesh_count: number;
    /* Real amount processed after cutting, bolts excluded (Candidate.metrics.triangles). */
    triangles: number;
  };
  spec: ProposalSpec;
  /* Left out of the list query (hundreds of KB per row); fetchProposalDrawing reads a single one when a sheet is opened. */
  drawing_svg?: string;
  note: string | null;
  engine_version: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
