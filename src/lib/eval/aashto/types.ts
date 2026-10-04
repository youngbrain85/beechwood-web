// ------------------------------------------------------------------
//  AASHTO element / defect / condition state module: shared types.
//  Types only (no run-time values). No outside dependency such as React or Supabase.
// ------------------------------------------------------------------

/* MBEI condition state: 1 (good) to 4 (severe) */
export type ConditionState = 1 | 2 | 3 | 4;

/* Top-level category: every AASHTO element belongs to one of these four */
export type ElementCategory = 'deck' | 'super' | 'sub' | 'other';

/* AASHTO element definition: one row of the reference table */
export interface ElementDef {
  no: number;
  name: string;
  unit: 'sq ft' | 'ft' | 'each';
  category: ElementCategory;
}

/**
 * AASHTO defect definition: appliesTo lists the element categories where the defect can occur.
 * cs holds a short description per condition state 2/3/4 (at most 120 characters, a paraphrase, not copied verbatim).
 */
export interface DefectDef {
  no: number;
  name: string;
  appliesTo: ElementCategory[];
  cs: Record<2 | 3 | 4, string>;
}

/* Element quantity per object (member instance): one row of the structure-wide inventory */
export interface ElementQuantity {
  objectCode: string;
  elementNo: number;
  quantity: number;
}

/* One defect observation on an object and element: quantity is in condition state cs */
export interface Observation {
  objectCode: string;
  elementNo: number;
  defectNo: number;
  cs: ConditionState;
  quantity: number;
}

/**
 * Totals per element (whole structure, objects summed): cs[0..3] = CS1..CS4 quantities.
 * CS1 = total - sum(CS2..CS4), floored at 0.
 */
export interface ElementCondition {
  elementNo: number;
  total: number;
  cs: [number, number, number, number];
}

/* What gets an NBI component rating: deck/superstructure/substructure only ('other' is N/A in the UI) */
export type Component = 'deck' | 'super' | 'sub';
