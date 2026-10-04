// ------------------------------------------------------------------
//  UI strings of the AASHTO element condition and NBI component rating screens.
//
//  Rules (where they differ from the header of s.app.ts):
//   · English only — the module top level holds literals and function declarations only.
//   - Display text only. Stored values (defect names, element names, units) come as stored from the database and the library (lib/eval/aashto).
//   - No hard-coded bridge name; the name and subtitle come from the profile (bridge.texts).
//   - Style: Title Case for labels, buttons and titles, sentence case for sentences (as in s.app.ts).
//  Terms: AASHTO MBEI condition states CS1 Good, CS2 Fair, CS3 Poor, CS4 Severe; NBI component rating descriptors 0-9
//  (Excellent ... Failed); SNBI bands Good/Fair/Poor. Text checks: s.eval.test.ts.
// ------------------------------------------------------------------

/* Columns of the printed sheet table "ELEMENT CONDITION QUANTITIES"; same order and wording as the pipeline's EL_COLS */
export const SQtyCols = ['No.', 'Element', 'Defect', 'CS', 'Qty', 'Unit', 'Notes'] as const;

/* Condition state names (MBEI); one set shared by SEval.csName and csLabel */
const CS_NAME: Record<1 | 2 | 3 | 4, string> = { 1: 'Good', 2: 'Fair', 3: 'Poor', 4: 'Severe' };

export const SEval = {
  // ---- Common terms ----
  cs: (n: number): string => `CS${n}`,
  csName: CS_NAME,
  /** 'CS3 · Poor' */
  csLabel: (n: 1 | 2 | 3 | 4): string => `CS${n} · ${CS_NAME[n]}`,
  conditionState: 'Condition State',
  component: { deck: 'Deck', super: 'Superstructure', sub: 'Substructure', other: 'Other' },
  band: { good: 'Good', fair: 'Fair', poor: 'Poor' },
  /* NBI component rating descriptors 0-9 (index = rating) */
  ratingWord: [
    'Failed',
    'Imminent Failure',
    'Critical',
    'Serious',
    'Poor',
    'Fair',
    'Satisfactory',
    'Good',
    'Very Good',
    'Excellent',
  ],
  notApplicable: 'N/A',
  computedNote: 'Computed from element condition states — not an official NBI rating.',
  /** '109 Prestressed Concrete Open Girder/Beam' */
  numbered: (no: number, name: string): string => `${no} ${name}`,
  element: 'Element',
  defect: 'Defect',
  quantity: 'Quantity',
  unit: 'Unit',
  notes: 'Notes',
  location: 'Location',
  all: 'All',
  loading: 'Loading…',
  loadError: 'Could not load data.',
  noElement: 'No AASHTO element',
  noDamages: 'No damages registered.',
  noDamagesHint: 'Damages registered in the 3D View appear here.',
  noDefects: 'No defects recorded',
  unknownDefect: 'Unspecified defect',
  /* Defect glyph legend: the printed sheet LEGEND wording + defects without a glyph */
  symbol: {
    crack: 'Cracking',
    spall: 'Spall / delamination',
    rebar: 'Exposed rebar',
    efflor: 'Efflorescence / rust staining',
    abrasion: 'Abrasion / wear',
    corrosion: 'Corrosion',
    leakage: 'Leakage / seal damage',
    settlement: 'Settlement / scour',
    other: 'Other defect (no symbol)',
  },

  // ---- Dashboard (overview) ----
  overview: {
    title: 'Dashboard',
    subtitle: (bridgeName: string): string => `${bridgeName} · Overall condition summary`,
    asOf: (date: string): string => `As of ${date}`,
    eyebrow: 'Target Bridge',
    objects: 'Objects',
    damages: 'Damage Records',
    sheets: 'Map Sheets',
    lastObserved: 'Last Observed',
    ratingsTitle: 'Component Condition Ratings (0–9)',
    /* Failed v_nbi_components query: the hook's error text (PostgREST message) is appended (instead of a silent N/A) */
    ratingsError: (detail: string): string => `Could not load component ratings (v_nbi_components) — ${detail}`,
    overallTitle: 'Overall Condition',
    overallHint: 'Lowest of deck, superstructure and substructure',
    elementsTitle: 'Element Condition Summary',
    elementsHint: (n: number): string => `${n} AASHTO elements · share of quantity in CS1–CS4`,
    /* Failed v_element_condition query: the hook's error text is appended */
    elementsError: (detail: string): string => `Could not load element conditions (v_element_condition) — ${detail}`,
    worst: 'Worst',
    condition: 'Condition',
    recentTitle: 'Recent Damages',
    recentHint: 'Latest 6',
  },

  // ---- Analysis: element condition table ----
  analysis: {
    title: 'Damage Analysis',
    subtitle: 'AASHTO MBEI element condition states and computed NBI component ratings',
    tableTitle: 'Element Conditions',
    tableHint: 'Latest observation of each active damage',
    totalQty: 'Total Qty',
    /* Element rating column: v_element_condition.rating (the element's own ladder rating 0-9) */
    rating: 'Rating',
    worstDefects: 'Worst Defects',
    componentRating: (rating: number, word: string): string => `Computed rating ${rating} · ${word}`,
    notRated: 'Not rated (N/A)',
    cardElements: 'Elements',
    cardElementsSub: (withDefects: number): string => `${withDefects} with defects`,
    cardDamages: 'Active Damages',
    cardDamagesSub: (cs3: number, cs4: number): string => `CS3 ${cs3} · CS4 ${cs4}`,
    cardOverall: 'Overall Condition',
    damagesTitle: 'Damage Records',
    damagesHint: 'Each active damage with its latest observation',
  },

  // ---- Quantities: element condition quantities ----
  quantities: {
    title: 'Element Condition Quantities',
    subtitle: 'Condition-state quantities by object or sheet · same columns as the printed damage map',
    count: (shown: number, total: number): string => `${shown} / ${total}`,
    groupBy: 'Group By',
    byObject: 'Object',
    bySheet: 'Sheet',
    componentFilter: 'Component',
    csFilter: 'Condition State',
    reset: 'Reset Filters',
    groupSummary: (n: number): string => (n === 1 ? '1 damage' : `${n} damages`),
    noSheet: 'Not on a map sheet (registered in the 3D View)',
    empty: 'No damages match the filters.',
  },

  // ---- 3D view ----
  model: {
    heatmap: 'Condition State Heatmap',
    legendTitle: 'Worst Condition State (Objects)',
    notRated: 'No AASHTO element',
    worstCs: 'Worst CS',
  },

  // ---- Damage registration ----
  form: {
    title: 'Register Damage',
    noElement:
      'This object carries no AASHTO element — the damage is recorded but not counted in element condition states.',
    defectPlaceholder: 'Select a defect',
    csHelp: 'Pick the condition state that matches the defect as observed.',
    quantityHelp: 'Portion of the element in this condition state',
    unitLocked: "Fixed to the element's unit",
    notesPlaceholder: 'Location on the member, remarks',
    cancel: 'Cancel',
    register: 'Register',
    errNoObject: 'No matching row in the object register (objects) — cannot register.',
    errDefect: 'Select a defect.',
    errCs: 'Select a condition state.',
    errQuantity: 'Enter a quantity greater than zero.',
    errUnit: 'Select a unit.',
    /* Quantity > element total of the object (object_elements.quantity): a non-blocking warning. total is in the on-screen quantity format (formatQty) */
    warnOverTotal: (total: string, unit: string): string => `Exceeds this element's total of ${total} ${unit} — check the quantity`,
  },

  // ---- Inspection sheets ----
  drawings: {
    legendTitle: 'Legend — AASHTO Defect Symbols',
    csKey: 'Marker colour = condition state',
    damagesTitle: 'Damages on This Sheet',
  },
} as const;
