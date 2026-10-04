// Fake Supabase client of fixture mode: mimics only the chains the app really uses.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeClient, FIXTURE_MARKER } from './fakeClient';

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `r${i}`, bridge_id: 'b1', round_label: i === 0 ? '2026-09' : `R${i}` }));

describe('createFakeClient', () => {
  it('select and order pass through, range slices: paging over 1,000 rows terminates', async () => {
    const sb = createFakeClient({ objects: rows(1038) });
    const p1 = await sb.from('objects').select('*').order('object_code').range(0, 999);
    const p2 = await sb.from('objects').select('*').order('object_code').range(1000, 1999);
    expect([p1.error, p1.data?.length, p2.data?.length]).toEqual([null, 1000, 38]);
  });

  it('eq filter + maybeSingle / single', async () => {
    const sb = createFakeClient({ inspections: rows(3) });
    const hit = await sb.from('inspections').select('id').eq('bridge_id', 'b1').eq('round_label', '2026-09').maybeSingle();
    expect(hit.data).toMatchObject({ id: 'r0' });
    const miss = await sb.from('inspections').select('id').eq('round_label', 'no such round').maybeSingle();
    expect([miss.data, miss.error]).toEqual([null, null]);
  });

  it('a missing table gives an empty list (not an error)', async () => {
    const sb = createFakeClient({});
    expect(await sb.from('bridge_sections').select('*').order('sort_no')).toEqual({ data: [], error: null });
  });

  it('insert writes nothing to a database and only records: used to check the stored-value contract from a screen', async () => {
    const sb = createFakeClient({ damages: [] });
    const r = await sb.from('damages').insert({ fault_type: 'Corrosion', bridge_id: 'b1' }).select('id').single();
    expect(r.error).toBeNull();
    expect(String(r.data?.id)).toMatch(/^fx-/);
    const r2 = await sb.from('damage_observations').insert({ damage_id: r.data?.id, grade: 'C' });
    expect(r2.error).toBeNull();
    expect(sb.writes).toEqual([
      { table: 'damages', row: { fault_type: 'Corrosion', bridge_id: 'b1' } },
      { table: 'damage_observations', row: { damage_id: r.data?.id, grade: 'C' } },
    ]);
  });

  it('an inserted row shows in the next select of the same table', async () => {
    const sb = createFakeClient({ sheet_proposals: [] });
    const created = await sb.from('sheet_proposals').insert({ title: 'New proposal', status: 'proposed' }).select('id').single();
    const list = await sb.from('sheet_proposals').select('*').order('created_at');
    expect(list).toEqual({
      data: [{ id: created.data?.id, title: 'New proposal', status: 'proposed' }],
      error: null,
    });
  });

  it("update(patch).eq('id', ...) changes the in-memory row and records { op: 'update', match } in writes", async () => {
    const sb = createFakeClient({ sheet_proposals: [{ id: 'p1', status: 'proposed' }] });
    const res = await sb.from('sheet_proposals').update({ status: 'discarded' }).eq('id', 'p1');
    expect(res).toEqual({ data: [{ id: 'p1', status: 'discarded' }], error: null });

    const after = await sb.from('sheet_proposals').select('*').eq('id', 'p1').maybeSingle();
    expect(after).toEqual({ data: { id: 'p1', status: 'discarded' }, error: null });

    expect(sb.writes).toEqual([
      { table: 'sheet_proposals', row: { status: 'discarded' }, op: 'update', match: { id: 'p1' } },
    ]);
  });

  it('without the views option the same key of the snapshot is returned as is', async () => {
    const sb = createFakeClient({ v_sum: [{ total: 999 }] });
    expect(await sb.from('v_sum').select('*')).toEqual({ data: [{ total: 999 }], error: null });
  });

  it('views: a registered name is answered by its compute function from the session rows (source + inserts + updates) instead of the snapshot key', async () => {
    const sb = createFakeClient(
      { items: [{ id: 'a', n: 1 }], v_sum: [{ total: 999 }] },
      {
        views: {
          v_sum: async (read) => [{ total: (await read('items')).reduce((s, r) => s + Number(r.n), 0) }],
        },
      },
    );
    expect(await sb.from('v_sum').select('*')).toEqual({ data: [{ total: 1 }], error: null });

    await sb.from('items').insert({ n: 2 });
    await sb.from('items').update({ n: 5 }).eq('id', 'a');
    expect(await sb.from('v_sum').select('*')).toEqual({ data: [{ total: 7 }], error: null });
  });

  it('views: eq and range apply to computed rows as well', async () => {
    const sb = createFakeClient(
      {},
      { views: { v_rows: async () => [{ k: 'x', i: 0 }, { k: 'y', i: 1 }, { k: 'x', i: 2 }] } },
    );
    const hit = await sb.from('v_rows').select('*').eq('k', 'x').range(1, 1);
    expect(hit).toEqual({ data: [{ k: 'x', i: 2 }], error: null });
  });

  it('auth: a fake session lets the gate through', async () => {
    const sb = createFakeClient({});
    const { data } = await sb.auth.getSession();
    expect(data.session?.user.email).toBe('fixture@local');
    const sub = sb.auth.onAuthStateChange(() => {});
    expect(typeof sub.data.subscription.unsubscribe).toBe('function');
  });

  it('the marker string the deploy guard looks for', () => {
    expect(FIXTURE_MARKER).toBe('__FIXTURE_MODE__');
  });
});

// ------------------------------------------------------------------
//  One level of embedded select: like real PostgREST, the `relation(cols...)` and `alias:fk_column(cols...)` parts are resolved.
//  Only the relations the screens use (damages to damage_observations, objects, sheets, inspections). A damage registered in the
//  session also comes back with its observation and round, so the heatmap and recent damages change without a reload.
// ------------------------------------------------------------------
const DAMAGES_SELECT = '*, damage_observations(*), inspections:first_inspection_id(round_label)'; // the same string as useDamages

describe('createFakeClient: one level of embedded select', () => {
  /* Snapshot shape: damages already carry their observations and round, and there is no top-level damage_observations table */
  const snapshot = () => ({
    damages: [
      {
        id: 'd1',
        object_id: 'o1',
        first_inspection_id: 'i1',
        damage_observations: [{ id: 'ob1', damage_id: 'd1', grade: 'b' }],
        inspections: { round_label: 'R1' },
      },
    ],
    inspections: [
      { id: 'i1', round_label: 'R1', bridge_id: 'b1' },
      { id: 'i2', round_label: 'R2', bridge_id: 'b1' },
    ],
  });

  it('a damage registered in the session comes back with its observation (1:N) and round (N:1, only the columns in parentheses)', async () => {
    const sb = createFakeClient(snapshot());
    const d = await sb.from('damages').insert({ object_id: 'o2', first_inspection_id: 'i2' }).select('id').single();
    await sb.from('damage_observations').insert({ damage_id: d.data?.id, grade: 'c' });

    const res = await sb.from('damages').select(DAMAGES_SELECT);
    // status, created_at and observed_at are the database defaults on insert (group below)
    expect(res.data?.[1]).toEqual({
      id: 'fx-1',
      object_id: 'o2',
      first_inspection_id: 'i2',
      status: 'active',
      created_at: expect.any(String),
      damage_observations: [{ id: 'fx-2', damage_id: 'fx-1', grade: 'c', observed_at: expect.any(String) }],
      inspections: { round_label: 'R2' },
    });
  });

  it('a snapshot damage keeps its nested observations and round, and only session observations are appended (the same observation id once)', async () => {
    const sb = createFakeClient(snapshot());
    expect((await sb.from('damages').select(DAMAGES_SELECT)).data).toEqual(snapshot().damages);

    await sb.from('damage_observations').insert({ id: 'ob1', damage_id: 'd1', grade: 'x' }); // the same id as in the snapshot
    await sb.from('damage_observations').insert({ damage_id: 'd1', grade: 'd' });
    const [d1] = (await sb.from('damages').select(DAMAGES_SELECT)).data ?? [];
    expect(d1?.damage_observations).toEqual([
      { id: 'ob1', damage_id: 'd1', grade: 'b' },
      { id: 'fx-2', damage_id: 'd1', grade: 'd', observed_at: expect.any(String) },
    ]);
    expect(d1?.inspections).toEqual({ round_label: 'R1' });
  });

  it('N:1: objects(...) and sheets(*) are looked up by FK, null when the target is missing; a 1:N without children is []', async () => {
    const sb = createFakeClient({
      damages: [{ id: 'd1', object_id: 'o1', sheet_id: 's1', first_inspection_id: 'nope' }],
      objects: [{ id: 'o1', object_code: 'BW_BEAM_B2', name: 'Beam' }],
      sheets: [{ id: 's1', title: 'Sheet', sort_no: 1 }],
    });
    const res = await sb.from('damages').select('*, objects(object_code), sheets(*), inspections:first_inspection_id(round_label), damage_observations(*)');
    expect(res.data).toEqual([
      {
        id: 'd1',
        object_id: 'o1',
        sheet_id: 's1',
        first_inspection_id: 'nope',
        objects: { object_code: 'BW_BEAM_B2' },
        sheets: { id: 's1', title: 'Sheet', sort_no: 1 },
        inspections: null,
        damage_observations: [],
      },
    ]);
  });

  it("without an embed or with an unknown relation the row is unchanged, with no new keys (select('*'))", async () => {
    const sb = createFakeClient({ damages: [{ id: 'd1' }], objects: [{ id: 'o1' }] });
    expect((await sb.from('damages').select('*')).data).toEqual([{ id: 'd1' }]);
    expect((await sb.from('damages').select('*, nothing_here(*)')).data).toEqual([{ id: 'd1' }]);
    expect((await sb.from('objects').select('*, damages(*)')).data).toEqual([{ id: 'o1' }]);
  });

  it('also attaches to rows left after eq and range', async () => {
    const sb = createFakeClient(snapshot());
    await sb.from('damages').insert({ object_id: 'o2', first_inspection_id: 'i2' });
    const res = await sb.from('damages').select(DAMAGES_SELECT).eq('object_id', 'o2').range(0, 0);
    expect(res.data).toEqual([
      {
        id: 'fx-1',
        object_id: 'o2',
        first_inspection_id: 'i2',
        status: 'active',
        created_at: expect.any(String),
        damage_observations: [],
        inspections: { round_label: 'R2' },
      },
    ]);
  });
});

// ------------------------------------------------------------------
//  Database defaults on insert (schema.sql), for the two damage tables only: damages.status 'active', damages.created_at now(),
//  damage_observations.observed_at now(). The screens filter (active damages) and sort (recent damages = latest observation) by them;
//  without the defaults session rows drop to the end of the lists and are cut off. writes (the stored-value contract) keep only what was sent.
// ------------------------------------------------------------------
describe('createFakeClient: database defaults on insert (the two damage tables)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fills the defaults into session rows of damages and damage_observations; writes keep what was sent', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-26T01:02:03.000Z'));
    const sb = createFakeClient({});
    const d = await sb.from('damages').insert({ object_id: 'o1' }).select('id').single();
    await sb.from('damage_observations').insert({ damage_id: d.data?.id, condition_state: 4 });

    expect((await sb.from('damages').select('*')).data).toEqual([
      { id: 'fx-1', object_id: 'o1', status: 'active', created_at: '2026-09-26T01:02:03.000Z' },
    ]);
    expect((await sb.from('damage_observations').select('*')).data).toEqual([
      { id: 'fx-2', damage_id: 'fx-1', condition_state: 4, observed_at: '2026-09-26T01:02:03.000Z' },
    ]);
    expect(sb.writes).toEqual([
      { table: 'damages', row: { object_id: 'o1' } },
      { table: 'damage_observations', row: { damage_id: 'fx-1', condition_state: 4 } },
    ]);
  });

  it('a sent value wins; defaults fill empty fields only', async () => {
    const sb = createFakeClient({});
    await sb.from('damages').insert({ status: 'deleted', created_at: '2020-01-01T00:00:00Z' });
    await sb.from('damage_observations').insert({ observed_at: '2021-01-01T00:00:00Z' });
    expect((await sb.from('damages').select('*')).data).toEqual([
      { id: 'fx-1', status: 'deleted', created_at: '2020-01-01T00:00:00Z' },
    ]);
    expect((await sb.from('damage_observations').select('*')).data).toEqual([
      { id: 'fx-2', observed_at: '2021-01-01T00:00:00Z' },
    ]);
  });

  it('other tables get no defaults (the sent row as is: proposals, rounds and so on)', async () => {
    const sb = createFakeClient({});
    await sb.from('inspections').insert({ bridge_id: 'b1', round_label: '2026-09' });
    expect((await sb.from('inspections').select('*')).data).toEqual([{ id: 'fx-1', bridge_id: 'b1', round_label: '2026-09' }]);
  });
});
