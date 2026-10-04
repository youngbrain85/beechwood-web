// ------------------------------------------------------------------
//  Fake Supabase client for fixture mode (verification only; never part of a production bundle)
//
//  Mimics only the chains the app really uses (hooks/useSupabase.ts, auth/*):
//    from(t).select(...).eq(...).order(...).range(a,b)  -> awaiting gives { data, error }
//    ….maybeSingle() / .single()
//    from(t).insert(row)[.select('id').single()]   -> **the source is untouched**; rows are kept in
//                                                      the session's added list + recorded in writes
//    from(t).update(patch).eq(...)                  -> kept in the session's patches (applied at then time)
//                                                      + { op:'update', match } recorded in writes
//    auth.getSession / onAuthStateChange / signOut / signInWithPassword
//    storage.from(b).createSignedUrls(paths) / createSignedUrl(path) -> a placeholder image (data URI) carrying the path
//                                                      (a path ending in '-broken.jpg' gives an address that cannot be opened)
//  Ordering is left alone: the snapshot is already stored in the order the app asks for.
//  Data is given as an object or an async loader (on the dev server it arrives late through fetch).
//  insert/update are visible only within the same session (the same createFakeClient instance): the next select
//  reads the source (tables()) merged with added, with patches written over it.
//  Computed views (options.views): a from(view) with a registered name is computed by that function from the session rows
//  (source + added + patches as above) instead of the snapshot key, so a registered row shows in the views at once. Computation order is response order.
//  One level of embedded select: the `relation(cols...)` and `alias:fk_column(cols...)` parts of the select string are resolved
//  like PostgREST, only for the relations listed in RELATIONS (those the screens use: damages to damage_observations, objects, sheets, inspections;
//  damage_photos to inspections).
//  Values already nested in snapshot rows (stored with the same select) are kept, and for 1:N only the session rows
//  are appended, so existing queries return the same result and a damage registered in the session shows with its observation and round.
//  (The column list itself is not filtered: the top level is always the whole row; only embeds are cut to the columns in parentheses.)
//  Database defaults on insert (INSERT_DEFAULTS), for the two damage tables only: damages.status, created_at; damage_observations.observed_at.
//  They are filled in session rows only and not in writes (what the app sent).
// ------------------------------------------------------------------

/* Marker the deploy guard (scripts/lib/dist-guard.mjs) looks for in build output; a build holding it is refused. */
export const FIXTURE_MARKER = '__FIXTURE_MODE__';

/* Path suffix of the synthesized photo that is broken on purpose (src/dev/fixturePhotos.ts). */
export const BROKEN_SUFFIX = '-broken.jpg';

/**
 * A photo in fixture mode: an SVG placeholder carrying the path instead of a real image (no network, no bucket access).
 * It lets the layout, the enlarged view and the round labels be looked at without signing in.
 */
export function fixturePhotoUrl(path: string): string {
  // Broken image scene (scripts/dev-shots.mjs photos): a path with this suffix gets an image address that cannot be opened (no network).
  if (path.endsWith(BROKEN_SUFFIX)) return 'data:image/jpeg;base64,AA==';
  const label = path.length > 42 ? `…${path.slice(-41)}` : path;
  const esc = label.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">' +
    '<rect width="800" height="600" fill="#dfe3e8"/>' +
    '<path d="M0 600 L260 330 L420 470 L560 360 L800 600 Z" fill="#b8c0ca"/>' +
    '<circle cx="620" cy="160" r="54" fill="#c9d0d8"/>' +
    '<text x="400" y="80" font-family="sans-serif" font-size="30" text-anchor="middle" fill="#4a5563">FIXTURE PHOTO</text>' +
    `<text x="400" y="560" font-family="monospace" font-size="22" text-anchor="middle" fill="#4a5563">${esc}</text>` +
    '</svg>';
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;
interface Result<T> {
  data: T;
  error: { message: string } | null;
}

/* One embedded part of a select: key = response key (alias or relation name), rel = relation name or FK column, cols: null = '*' */
interface Embed {
  key: string;
  rel: string;
  cols: string[] | null;
}

/* Splits only at commas outside parentheses */
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

/* select string to its embedded parts (`relation(cols)`, `alias:relation(cols)`, `relation!hint(cols)`), plain columns left out */
function parseEmbeds(select: string): Embed[] {
  return splitTop(select).flatMap((part) => {
    const m = /^(?:(\w+):)?(\w+)(?:!\w+)?\(([\s\S]*)\)$/.exec(part);
    if (!m) return [];
    const [, alias, rel, inner] = m as unknown as [string, string | undefined, string, string];
    return [{ key: alias ?? rel, rel, cols: inner.trim() === '*' ? null : splitTop(inner) }];
  });
}

/**
 * Relations the fake resolves: only those the screens use (the foreign keys of the pipeline's db/schema.sql).
 * Parent table to { relation name or FK column name: target table and FK column (many when on the child side) }.
 */
const RELATIONS: Record<string, Record<string, { table: string; fk: string; many: boolean }>> = {
  damages: {
    damage_observations: { table: 'damage_observations', fk: 'damage_id', many: true },
    objects: { table: 'objects', fk: 'object_id', many: false },
    object_id: { table: 'objects', fk: 'object_id', many: false },
    sheets: { table: 'sheets', fk: 'sheet_id', many: false },
    sheet_id: { table: 'sheets', fk: 'sheet_id', many: false },
    inspections: { table: 'inspections', fk: 'first_inspection_id', many: false },
    first_inspection_id: { table: 'inspections', fk: 'first_inspection_id', many: false },
  },
  damage_photos: {
    inspections: { table: 'inspections', fk: 'inspection_id', many: false },
  },
};

/* Keeps only the columns in parentheses (everything for '*') */
const project = (row: Row, cols: string[] | null): Row =>
  cols ? Object.fromEntries(cols.map((c) => [c, row[c] ?? null])) : row;

/**
 * Attaches embeds: 1:N is [those nested in the snapshot ..., session children (each id once) ...]; N:1 is looked up
 * by FK only when the snapshot has no value (null when not found). Unknown relation parts are skipped (row unchanged).
 */
async function withEmbeds(
  table: string,
  rows: Row[],
  embeds: Embed[],
  rowsOf: (t: string) => Promise<Row[]>,
): Promise<Row[]> {
  const rels = RELATIONS[table] ?? {};
  const known = embeds.filter((e) => rels[e.rel]);
  if (!known.length) return rows;
  const pools = await Promise.all(known.map((e) => rowsOf(rels[e.rel]!.table)));
  return rows.map((row) => {
    const out: Row = { ...row };
    known.forEach((e, i) => {
      const rel = rels[e.rel]!;
      const pool = pools[i]!;
      if (rel.many) {
        const own = Array.isArray(row[e.key]) ? (row[e.key] as Row[]) : [];
        const seen = new Set(own.map((c) => String(c.id)));
        const extra = pool.filter((c) => c[rel.fk] === row.id && !seen.has(String(c.id)));
        out[e.key] = [...own, ...extra.map((c) => project(c, e.cols))];
      } else if (row[e.key] === undefined) {
        const hit = row[rel.fk] == null ? undefined : pool.find((c) => c.id === row[rel.fk]);
        out[e.key] = hit ? project(hit, e.cols) : null;
      }
    });
    return out;
  });
}

class Query implements PromiseLike<Result<Row[]>> {
  private ops: Array<(rows: Row[]) => Row[]> = [];
  private embeds: Embed[] = [];
  constructor(
    private readonly load: () => Promise<Row[]>,
    private readonly embed?: (rows: Row[], embeds: Embed[]) => Promise<Row[]>,
  ) {}

  select(cols?: string): this {
    this.embeds = cols ? parseEmbeds(cols) : [];
    return this;
  }
  order(_col: string, _opts?: unknown): this {
    return this;
  }
  eq(col: string, val: unknown): this {
    this.ops.push((rows) => rows.filter((r) => r[col] === val));
    return this;
  }
  range(from: number, to: number): this {
    this.ops.push((rows) => rows.slice(from, to + 1));
    return this;
  }
  private async rows(): Promise<Row[]> {
    let rows = await this.load();
    for (const op of this.ops) rows = op(rows);
    return this.embed && this.embeds.length ? this.embed(rows, this.embeds) : rows;
  }
  async maybeSingle(): Promise<Result<Row | null>> {
    return { data: (await this.rows())[0] ?? null, error: null };
  }
  async single(): Promise<Result<Row | null>> {
    const first = (await this.rows())[0];
    return first ? { data: first, error: null } : { data: null, error: { message: 'fixture: no rows' } };
  }
  then<A = Result<Row[]>, B = never>(
    ok?: ((v: Result<Row[]>) => A | PromiseLike<A>) | null,
    fail?: ((e: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return this.rows()
      .then((data): Result<Row[]> => ({ data, error: null }))
      .then(ok, fail);
  }
}

export interface FakeWrite {
  table: string;
  row: Row;
  /* Filled for update only; left empty for insert to stay compatible with existing tests (byte-exact toEqual). */
  op?: 'insert' | 'update';
  /* Conditions collected by .eq() on an update. */
  match?: Row;
}

/* from(t).update(patch).eq(col,val)...: like real Supabase, the conditions are applied together at then time (await). */
class UpdateQuery implements PromiseLike<Result<Row[]>> {
  private match: Row = {};
  constructor(
    private readonly loadRows: () => Promise<Row[]>,
    private readonly patch: Row,
    private readonly onApply: (matchedIds: string[], patch: Row, match: Row) => void,
  ) {}

  eq(col: string, val: unknown): this {
    this.match[col] = val;
    return this;
  }
  private async apply(): Promise<Result<Row[]>> {
    const rows = await this.loadRows();
    const hit = rows.filter((r) => Object.entries(this.match).every(([col, val]) => r[col] === val));
    this.onApply(hit.map((r) => String(r.id)), this.patch, { ...this.match });
    return { data: hit.map((r) => ({ ...r, ...this.patch })), error: null };
  }
  then<A = Result<Row[]>, B = never>(
    ok?: ((v: Result<Row[]>) => A | PromiseLike<A>) | null,
    fail?: ((e: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return this.apply().then(ok, fail);
  }
}

/**
 * Database defaults (schema.sql) filled into empty fields on insert, for the two damage tables only. The screens filter
 * (active damages: status) and sort (recent damages: latest observed_at, damage created_at) by these fields; without them
 * rows registered in the session would drop to the end of the lists and be cut off. Session rows (added) only, never writes (what the app sent).
 */
const INSERT_DEFAULTS: Record<string, () => Row> = {
  damages: () => ({ status: 'active', created_at: new Date().toISOString() }),
  damage_observations: () => ({ observed_at: new Date().toISOString() }),
};

/* Computed view: read(table) returns the session rows (source + inserts + updates). The returned order is the response order. */
export type FakeView = (read: (table: string) => Promise<Row[]>) => Promise<readonly object[]>;

export interface FakeClientOptions {
  /* View name to its compute function. A name listed here wins over the same key in the snapshot. */
  views?: Record<string, FakeView>;
}

export function createFakeClient(source: Tables | (() => Promise<Tables>), options: FakeClientOptions = {}) {
  const writes: FakeWrite[] = [];
  /* Signing requests received by the fake storage (bucket and paths), in order. */
  const signs: Array<{ bucket: string; paths: string[] }> = [];
  let seq = 0;
  let cache: Promise<Tables> | null = null;
  const tables = (): Promise<Tables> =>
    (cache ??= typeof source === 'function' ? source() : Promise.resolve(source));

  // Session writes, kept per table and merged into later reads (the source tables() never changes).
  const added: Record<string, Row[]> = {};
  const patchesByTable: Record<string, Map<string, Row>> = {};
  const rowsOf = async (table: string): Promise<Row[]> => {
    const merged = [...((await tables())[table] ?? []), ...(added[table] ?? [])];
    const patches = patchesByTable[table];
    if (!patches?.size) return merged;
    return merged.map((r) => (patches.has(String(r.id)) ? { ...r, ...patches.get(String(r.id)) } : r));
  };
  const readTable = async (table: string): Promise<Row[]> => {
    const view = options.views?.[table];
    return view ? ((await view(rowsOf)) as Row[]) : rowsOf(table);
  };

  const session = {
    access_token: 'fixture',
    user: { id: 'fixture-user', email: 'fixture@local' },
  };
  return {
    writes,
    signs,
    from(table: string) {
      const q = new Query(
        () => readTable(table),
        (rows, embeds) => withEmbeds(table, rows, embeds, rowsOf),
      );
      return Object.assign(q, {
        insert(row: Row) {
          writes.push({ table, row });
          const created: Row = { id: `fx-${++seq}`, ...row };
          for (const [k, v] of Object.entries(INSERT_DEFAULTS[table]?.() ?? {})) if (created[k] === undefined) created[k] = v;
          (added[table] ??= []).push(created);
          return new Query(async () => [created]);
        },
        update(patch: Row) {
          return new UpdateQuery(() => rowsOf(table), patch, (ids, p, match) => {
            const bucket = (patchesByTable[table] ??= new Map());
            for (const id of ids) bucket.set(id, { ...(bucket.get(id) ?? {}), ...p });
            writes.push({ table, row: p, op: 'update', match });
          });
        },
      });
    },
    storage: {
      from(bucket: string) {
        return {
          async createSignedUrls(paths: string[], _expiresIn: number) {
            signs.push({ bucket, paths: [...paths] });
            return {
              data: paths.map((path) => ({ path, signedUrl: fixturePhotoUrl(path), error: null as string | null })),
              error: null,
            };
          },
          async createSignedUrl(path: string, _expiresIn: number) {
            signs.push({ bucket, paths: [path] });
            return { data: { signedUrl: fixturePhotoUrl(path) }, error: null };
          },
        };
      },
    },
    auth: {
      async getSession() {
        return { data: { session }, error: null };
      },
      onAuthStateChange(_cb: (event: string, s: unknown) => void) {
        return { data: { subscription: { unsubscribe() {} } } };
      },
      async signOut() {
        return { error: null };
      },
      async signInWithPassword(_cred: unknown) {
        return { data: { session }, error: null };
      },
    },
  };
}
