/**
 * A minimal, faithful-enough in-memory stand-in for the slice of
 * `@supabase/supabase-js`'s query builder `SupabaseSyncTransport` actually
 * uses — `select`/`insert`/`upsert`/`update`/`delete`, `.eq`/`.gt`/`.order`,
 * `.maybeSingle`, the `{count: 'exact', head: true}` form, and `.rpc`.
 *
 * There is no live PostgREST endpoint reachable from this environment to
 * integration-test the real client against (docs/build/NOTES.md), so this
 * exists to drive the transport through real insert/upsert/update/delete
 * semantics against a real in-memory table store — testing behaviour, not
 * "was this method called with these args". It is intentionally not a
 * generic Postgrest mock: anything the transport doesn't use isn't here.
 */

type Row = Record<string, unknown>;

export type RpcHandler = (args: Record<string, unknown>) => { error: Error | null };

export class FakePostgrestClient {
  readonly tables = new Map<string, Row[]>();
  private rpcHandlers = new Map<string, RpcHandler>();
  private pendingFailures = new Map<string, string>();

  seed(table: string, rows: Row[]): void {
    this.tables.set(table, [...rows]);
  }

  rows(table: string): Row[] {
    return this.tables.get(table) ?? [];
  }

  onRpc(name: string, handler: RpcHandler): void {
    this.rpcHandlers.set(name, handler);
  }

  /** The next operation against `table` fails with `message` instead of running; one-shot. */
  failNextOperationOn(table: string, message: string): void {
    this.pendingFailures.set(table, message);
  }

  from(table: string): FakeQueryBuilder {
    if (!this.tables.has(table)) this.tables.set(table, []);
    const failure = this.pendingFailures.get(table);
    this.pendingFailures.delete(table);
    return new FakeQueryBuilder(this.tables.get(table)!, failure);
  }

  rpc(name: string, args: Record<string, unknown> = {}): Promise<{ error: Error | null }> {
    const handler = this.rpcHandlers.get(name);
    if (!handler) throw new Error(`FakePostgrestClient: no handler registered for rpc "${name}"`);
    return Promise.resolve(handler(args));
  }
}

interface QueryResult {
  readonly data: Row | Row[] | null;
  readonly error: Error | null;
  readonly count?: number | null;
}

/**
 * A single `.from(table)` chain. Thenable, like the real builder, so
 * `await` works whether the caller stops at `.eq()`, `.maybeSingle()`,
 * `.returns()`, or nothing at all — exactly how `SupabaseSyncTransport`
 * calls it.
 */
class FakeQueryBuilder implements PromiseLike<QueryResult> {
  private operation: 'select' | 'insert' | 'upsert' | 'update' | 'delete' | null = null;
  private payload: Row | Row[] | null = null;
  private upsertConflictColumn: string | null = null;
  private filters: [string, unknown][] = [];
  private single = false;
  private wantCount = false;

  constructor(
    private readonly rows: Row[],
    private readonly injectedFailure?: string,
  ) {}

  select(_columns: string, opts?: { count?: 'exact'; head?: boolean }): this {
    if (this.operation === null) this.operation = 'select';
    if (opts?.count) this.wantCount = true;
    return this;
  }

  insert(rows: Row | Row[]): this {
    this.operation = 'insert';
    this.payload = rows;
    return this;
  }

  upsert(rows: Row | Row[], opts?: { onConflict?: string }): this {
    this.operation = 'upsert';
    this.payload = rows;
    this.upsertConflictColumn = opts?.onConflict ?? 'id';
    return this;
  }

  update(row: Row): this {
    this.operation = 'update';
    this.payload = row;
    return this;
  }

  delete(): this {
    this.operation = 'delete';
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push([column, value]);
    return this;
  }

  gt(column: string, value: unknown): this {
    this.filters.push([`${column}>`, value]);
    return this;
  }

  order(): this {
    return this;
  }

  maybeSingle(): this {
    this.single = true;
    return this;
  }

  returns(): this {
    return this;
  }

  private matches(row: Row): boolean {
    return this.filters.every(([column, value]) => {
      if (column.endsWith('>')) return (row[column.slice(0, -1)] as number) > (value as number);
      return row[column] === value;
    });
  }

  private execute(): QueryResult {
    if (this.injectedFailure) return { data: null, error: new Error(this.injectedFailure) };

    switch (this.operation) {
      case 'select': {
        const matched = this.rows.filter((row) => this.matches(row));
        if (this.wantCount) return { data: null, error: null, count: matched.length };
        if (this.single) return { data: matched[0] ?? null, error: null };
        return { data: matched, error: null };
      }
      case 'insert': {
        const rows = Array.isArray(this.payload) ? this.payload : [this.payload!];
        this.rows.push(...rows);
        return { data: rows, error: null };
      }
      case 'upsert': {
        const rows = Array.isArray(this.payload) ? this.payload : [this.payload!];
        const key = this.upsertConflictColumn!;
        for (const row of rows) {
          const existingIndex = this.rows.findIndex((r) => r[key] === row[key]);
          if (existingIndex === -1) this.rows.push(row);
          else this.rows[existingIndex] = { ...this.rows[existingIndex], ...row };
        }
        return { data: rows, error: null };
      }
      case 'update': {
        const matched = this.rows.filter((row) => this.matches(row));
        for (const row of matched) Object.assign(row, this.payload);
        return { data: matched, error: null };
      }
      case 'delete': {
        const toDelete = this.rows.filter((row) => this.matches(row));
        for (const row of toDelete) {
          const idx = this.rows.indexOf(row);
          if (idx !== -1) this.rows.splice(idx, 1);
        }
        return { data: toDelete, error: null };
      }
      default:
        throw new Error('FakeQueryBuilder: no operation selected before awaiting');
    }
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }
}
