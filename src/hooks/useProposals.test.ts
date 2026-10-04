// sheet_proposals hooks and save functions: the stored-value contract is checked with a fake client (pure functions only, no DOM;
// useSheetProposals itself is a React hook and cannot be tested without a renderer; it is covered indirectly through the isMissingTable branch).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeClient } from '@/dev/fakeClient';
import type { Candidate } from '@/lib/proposal/engine';
import { ENGINE_VERSION } from '@/lib/proposal/types';

// A tainted row: the row-level policy grants every signed-in user full access, so another user could plant this shape.
// (A vi.mock factory is hoisted and cannot read outside constants, so the value is written in place.)
const TAINTED_ID = 'fx-tainted';

vi.mock('@/lib/supabase', () => ({
  supabase: createFakeClient({
    sheet_proposals: [
      {
        id: 'fx-tainted',
        drawing_svg: '<g class="proposal-drawing">\n<image href="x" onerror="alert(1)"/>\n</g>',
      },
    ],
  }),
}));

import { supabase } from '@/lib/supabase';
import {
  LIST_COLUMNS,
  adoptZone,
  canAdopt,
  discardProposal,
  fetchProposalDrawing,
  isMissingTable,
  saveProposal,
} from './useProposals';

// vi.mock swaps supabase for the fake client only at run time; the static type is still the real
// SupabaseClient, which has no writes. This is a test-only assertion, so it is read back as the fake type.
const fakeSupabase = supabase as unknown as ReturnType<typeof createFakeClient>;

/* One engine candidate with every field of a real Candidate filled by hand (no partial mocks). */
const CANDIDATE: Candidate = {
  key: 'single',
  spec: {
    title: 'Title suggested by the engine',
    bridge: 'Beechwood Rd over Little Blue River',
    composition: 'single',
    engine: ENGINE_VERSION,
    placement_frame: 'topleft_normalized',
    canvas_mm: [420, 297],
    layout: {
      scale: '1:50',
      arrangement: 'single',
      paper: 'A3',
      main_area_mm: [10, 22, 304, 223],
      views_bbox_mm: [10, 22, 100, 80],
      fill_w: 0.5,
      fill_h: 0.4,
      fill_bbox: 0.2,
      fill_target: 0.85,
    },
    zone: {
      objects: ['BW_XF_B::X1'],
      clip: { x: null, y: null, z: null },
      bounds: { min: [0, 0, 0], max: [1, 1, 1] },
    },
    views: [],
  },
  // Exactly the shape the engine emits; fetchProposalDrawing validates it with isTrustedDrawing.
  drawing: [
    '<g class="proposal-drawing">',
    '<g data-view="v1">',
    '<path d="M 0.00 0.00 L 1.00 1.00" stroke="#000" stroke-width="0.35" stroke-linejoin="round" fill="none"/>',
    '</g>',
    '</g>',
  ].join('\n'),
  metrics: { views: 1, coverage: 0.8, fill: 0.5, paper: 'A3', denom: 50, triangles: 120 },
  warnings: [],
};

describe('isMissingTable', () => {
  it.each([
    ['PGRST205'],
    ["Could not find the table 'public.sheet_proposals' in the schema cache"],
    ['relation "public.sheet_proposals" does not exist'],
    ['schema cache'],
  ])('treats the message "%s" as a missing table', (message) => {
    expect(isMissingTable(message)).toBe(true);
  });

  it('is false for an unrelated error message', () => {
    expect(isMissingTable('duplicate key value violates unique constraint')).toBe(false);
  });
});

describe('canAdopt', () => {
  const base = { active: CANDIDATE, status: 'done' as const, available: true };

  it('can adopt when there is a candidate, the run is done and the table exists', () => {
    expect(canAdopt(base)).toBe(true);
  });

  it('cannot adopt while running: what is on screen is the previous candidate', () => {
    // useProposalEngine keeps the previous candidates while running to avoid flicker.
    // Adopting then would save the previous candidate's spec and drawing with the **current** selection and range.
    expect(canAdopt({ ...base, status: 'running' })).toBe(false);
  });

  it.each(['idle', 'error'] as const)('cannot adopt in the %s state either', (status) => {
    expect(canAdopt({ ...base, status })).toBe(false);
  });

  it('cannot adopt without a candidate or without the table', () => {
    expect(canAdopt({ ...base, active: null })).toBe(false);
    expect(canAdopt({ ...base, available: false })).toBe(false);
  });
});

describe('adoptZone', () => {
  it('the selection to save comes from the candidate\'s own record, not from screen state', () => {
    const c: Candidate = {
      ...CANDIDATE,
      spec: {
        ...CANDIDATE.spec,
        zone: {
          objects: ['BW_COL_9', 'BW_COL_10'],
          clip: { x: null, y: [1, 2], z: null },
          bounds: { min: [0, 0, 0], max: [1, 1, 1] },
        },
      },
    };
    expect(adoptZone(c)).toEqual({
      objectCodes: ['BW_COL_9', 'BW_COL_10'],
      clip: { x: null, y: [1, 2], z: null },
    });
  });

  it('changing the returned code list leaves the candidate\'s record intact', () => {
    const got = adoptZone(CANDIDATE);
    got.objectCodes.push('tainted');
    expect(CANDIDATE.spec.zone.objects).toEqual(['BW_XF_B::X1']);
  });
});

describe('saveProposal', () => {
  beforeEach(() => {
    fakeSupabase.writes.length = 0;
  });

  it('writes one sheet_proposals row without the database-default columns such as status and created_by', async () => {
    const id = await saveProposal({
      bridgeId: 'b1',
      sectionId: 's1',
      memberId: 3,
      title: 'Final title',
      note: '  note  ',
      candidate: CANDIDATE,
      objectCodes: ['BW_XF_B::X1'],
      clip: { x: null, y: [1, 2], z: null },
      meshes: [{ name: 'BW_XF_B::X1' }],
    });

    expect(id).toMatch(/^fx-/);
    expect(fakeSupabase.writes).toEqual([
      {
        table: 'sheet_proposals',
        row: {
          bridge_id: 'b1',
          section_id: 's1',
          member_id: 3,
          title: 'Final title',
          composition: 'single',
          selection: {
            object_codes: ['BW_XF_B::X1'],
            clip: { x: null, y: [1, 2], z: null },
            mesh_names: ['BW_XF_B::X1'],
            mesh_count: 1,
            triangles: 120,
          },
          // spec must not be the engine's suggested spec as is: only title is overwritten with the final value.
          spec: { ...CANDIDATE.spec, title: 'Final title' },
          drawing_svg: CANDIDATE.drawing,
          note: 'note',
          engine_version: ENGINE_VERSION,
        },
      },
    ]);
  });

  it('records mesh names in selection: no duplicates, natural order, with count and triangles', async () => {
    // Only the web code knows how selection keys (virtual keys included) resolve to meshes, so the
    // resolved mesh names are stored as well for a later sheet builder to reproduce the drawing.
    await saveProposal({
      bridgeId: 'b1',
      sectionId: null,
      memberId: null,
      title: 'Mesh names',
      note: '',
      candidate: CANDIDATE,
      objectCodes: ['BW_COL_9', 'BW_COL_10'],
      clip: { x: null, y: null, z: null },
      meshes: [
        { name: 'BW_COL_10::SHAFT' },
        { name: 'BW_COL_9::SHAFT' },
        { name: 'BW_COL_10::SHAFT' },   // the same name twice; only one must remain
        { name: 'BW_COL_10::CAP' },
      ],
    });
    expect(fakeSupabase.writes[0]?.row.selection).toEqual({
      object_codes: ['BW_COL_9', 'BW_COL_10'],
      clip: { x: null, y: null, z: null },
      // Natural order: _9 comes before _10 (by code unit _10 would be first).
      mesh_names: ['BW_COL_9::SHAFT', 'BW_COL_10::CAP', 'BW_COL_10::SHAFT'],
      mesh_count: 4,                 // mesh count (duplicates included); there are 3 names
      triangles: 120,                // real amount processed after cutting, bolts excluded (metrics.triangles)
    });
  });

  it('the list query columns exclude selection: the name list can be long and the screen does not read it', () => {
    const cols = LIST_COLUMNS.split(',');
    expect(cols).not.toContain('selection');
    expect(cols).not.toContain('drawing_svg');
    for (const c of ['id', 'title', 'status', 'composition', 'spec', 'created_at']) {
      expect(cols).toContain(c);
    }
  });

  it('sends null for a whitespace-only note', async () => {
    await saveProposal({
      bridgeId: 'b1',
      sectionId: null,
      memberId: null,
      title: 'Title',
      note: '   ',
      candidate: CANDIDATE,
      objectCodes: ['BW_XF_B::X1'],
      clip: { x: null, y: null, z: null },
      meshes: [{ name: 'BW_XF_B::X1' }],
    });
    expect(fakeSupabase.writes[0]?.row.note).toBeNull();
  });
});

describe('discardProposal · fetchProposalDrawing', () => {
  beforeEach(() => {
    fakeSupabase.writes.length = 0;
  });

  it('discarding changes status and records an update in writes', async () => {
    const id = await saveProposal({
      bridgeId: 'b1',
      sectionId: null,
      memberId: null,
      title: 'To discard',
      note: '',
      candidate: CANDIDATE,
      objectCodes: ['BW_XF_B::X1'],
      clip: { x: null, y: null, z: null },
      meshes: [{ name: 'BW_XF_B::X1' }],
    });
    fakeSupabase.writes.length = 0; // the insert record is not what this test is about

    await discardProposal(id);

    expect(fakeSupabase.writes).toEqual([
      { table: 'sheet_proposals', row: { status: 'discarded' }, op: 'update', match: { id } },
    ]);
  });

  it('reads a single drawing_svg', async () => {
    const id = await saveProposal({
      bridgeId: 'b1',
      sectionId: null,
      memberId: null,
      title: 'With drawing',
      note: '',
      candidate: CANDIDATE,
      objectCodes: ['BW_XF_B::X1'],
      clip: { x: null, y: null, z: null },
      meshes: [{ name: 'BW_XF_B::X1' }],
    });

    await expect(fetchProposalDrawing(id)).resolves.toBe(CANDIDATE.drawing);
  });

  it('throws for a missing id', async () => {
    await expect(fetchProposalDrawing('fx-missing')).rejects.toThrow();
  });

  it('does not open a tainted drawing_svg: only validated drawings reach the screen', async () => {
    await expect(fetchProposalDrawing(TAINTED_ID)).rejects.toThrow();
  });
});
