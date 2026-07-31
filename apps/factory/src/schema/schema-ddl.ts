/**
 * Schema diffing and DDL emission for app migrations.
 *
 * The app's `src/db/schema/` declares tables; the app's Durable Object holds
 * the real ones. Nothing connected the two, so an agent could rewrite the
 * schema, pass every gate, and ship an app whose first query hit a table that
 * was never created. This module is the missing half: given what the code
 * wants and what the database has, produce the SQL that closes the gap.
 *
 * Pure — no drizzle, no I/O. The desired snapshot is produced by a probe that
 * runs inside the app's own bundle (where drizzle lives); the actual snapshot
 * comes from the DO's `sqlite_master`. Keeping this side free of both is what
 * makes it testable against drizzle-kit's own output.
 *
 * **Additive only.** New tables and safely-addable columns generate SQL;
 * anything that could destroy data or that needs a human to disambiguate is
 * reported as blocking instead. That is the same line drizzle-kit draws when
 * it stops to ask whether a vanished table was renamed or dropped — with no
 * TTY to ask on, guessing is the only alternative, and guessing about data
 * loss is not acceptable.
 */

export interface ColumnSpec {
  name: string;
  /** SQLite storage type as drizzle reports it: text, integer, real, blob. */
  type: string;
  notNull: boolean;
  /** Rendered SQL for the default, or null. Expressions arrive parenthesised. */
  defaultSql: string | null;
}

interface IndexSpec {
  name: string;
  columns: string[];
  unique: boolean;
}

/**
 * Referential actions are carried as SQLite writes them (`cascade`,
 * `set null`, `no action`) so a spec round-trips through DDL unchanged.
 */
interface ForeignKeySpec {
  columns: string[];
  refTable: string;
  refColumns: string[];
  onUpdate: string;
  onDelete: string;
}

export interface TableSpec {
  name: string;
  columns: ColumnSpec[];
  /**
   * Primary key columns in key order — table-level rather than per-column
   * because that is the only shape both sides can express. `PRAGMA table_info`
   * marks each member of a composite key with its ordinal, so a per-column
   * flag would read a two-column key as two independent primary keys and diff
   * it against a declaration that has neither.
   */
  primaryKey: string[];
  indexes: IndexSpec[];
  /** Emitted when a table is created; never diffed — see `diffSchema`. */
  foreignKeys: ForeignKeySpec[];
}

export interface SchemaSnapshot {
  tables: TableSpec[];
}

export type SchemaChange =
  | { kind: "create_table"; table: string }
  | { kind: "add_column"; table: string; column: string }
  | { kind: "create_index"; table: string; index: string }
  | { kind: "drop_table"; table: string; reason: string }
  | { kind: "drop_column"; table: string; column: string; reason: string }
  | { kind: "alter_column"; table: string; column: string; reason: string }
  | { kind: "alter_primary_key"; table: string; reason: string };

/**
 * A blocking change, phrased for whoever has to fix it.
 *
 * These reach an agent through the shell and a person through the attempt
 * payload, so they name the table and column and then say what is actually
 * at stake — "run pnpm db:generate" is useless advice for a change that
 * generating cannot express.
 */
export function describeBlocking(change: SchemaChange): string {
  const where =
    "column" in change ? `${change.table}.${change.column}` : change.table;
  return "reason" in change
    ? `${where}: ${change.reason}`
    : `${where}: ${change.kind}`;
}

export interface SchemaDiff {
  /** Changes this module can perform safely, with `statements` to perform them. */
  additive: SchemaChange[];
  /** Changes that need a human. Their presence must refuse the publish. */
  blocking: SchemaChange[];
  statements: string[];
}

/**
 * Tables that are not part of the app's schema and must never be diffed
 * against it — the factory's own bookkeeping (`_sfab_`), SQLite's internals
 * (`sqlite_`), the Durable Object storage layer's (`_cf_`), and miniflare's
 * (`__miniflare_`). Treating any of them as unexpected would report
 * infrastructure as data loss.
 *
 * The miniflare entry only ever matches under `wrangler dev`, which is exactly
 * why it is here: without it, every local deploy would refuse with
 * `__miniflare_do_name` reported as a dropped table, and the failure would not
 * reproduce in production.
 */
const RESERVED_TABLE_PREFIXES = ["_sfab_", "sqlite_", "_cf_", "__miniflare_"];

function isReservedTable(name: string): boolean {
  return RESERVED_TABLE_PREFIXES.some((p) => name.startsWith(p));
}

function quote(identifier: string): string {
  return `\`${identifier.replace(/`/g, "``")}\``;
}

function quoteList(identifiers: string[]): string {
  return identifiers.map(quote).join(",");
}

/** Column definition body, shared by CREATE TABLE and ADD COLUMN. */
function columnDefinition(column: ColumnSpec, inlinePrimaryKey: boolean) {
  const parts = [quote(column.name), column.type];
  if (inlinePrimaryKey) {
    parts.push("PRIMARY KEY");
  }
  if (column.defaultSql != null) {
    parts.push(`DEFAULT ${column.defaultSql}`);
  }
  if (column.notNull) {
    parts.push("NOT NULL");
  }
  return parts.join(" ");
}

function foreignKeyClause(fk: ForeignKeySpec): string {
  return (
    `FOREIGN KEY (${quoteList(fk.columns)}) ` +
    `REFERENCES ${quote(fk.refTable)}(${quoteList(fk.refColumns)}) ` +
    `ON UPDATE ${fk.onUpdate} ON DELETE ${fk.onDelete}`
  );
}

export function emitCreateTable(table: TableSpec): string {
  // A single-column key is written on the column, which is both what
  // drizzle-kit emits and what makes `INTEGER PRIMARY KEY` a rowid alias.
  const inlinePk = table.primaryKey.length === 1 ? table.primaryKey[0] : null;
  const lines = table.columns.map((c) =>
    columnDefinition(c, c.name === inlinePk)
  );
  if (table.primaryKey.length > 1) {
    lines.push(`PRIMARY KEY(${quoteList(table.primaryKey)})`);
  }
  for (const fk of table.foreignKeys) {
    lines.push(foreignKeyClause(fk));
  }
  const body = lines.map((line) => `\t${line}`).join(",\n");
  return `CREATE TABLE ${quote(table.name)} (\n${body}\n);`;
}

function emitAddColumn(tableName: string, column: ColumnSpec): string {
  return `ALTER TABLE ${quote(tableName)} ADD ${columnDefinition(column, false)};`;
}

function emitCreateIndex(tableName: string, index: IndexSpec): string {
  const unique = index.unique ? "UNIQUE " : "";
  return `CREATE ${unique}INDEX ${quote(index.name)} ON ${quote(tableName)} (${quoteList(index.columns)});`;
}

/**
 * Whether a column can be appended to a table that may already hold rows.
 *
 * SQLite rejects `ADD COLUMN ... NOT NULL` without a default, because existing
 * rows would have nowhere to get a value. A column that is both required and
 * default-less is therefore only expressible at table-creation time.
 */
function canAddColumn(column: ColumnSpec): boolean {
  if (!column.notNull) {
    return true;
  }
  return column.defaultSql != null;
}

function byName<T extends { name: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((item) => [item.name, item]));
}

function diffColumns(
  desired: TableSpec,
  actual: TableSpec,
  additive: SchemaChange[],
  blocking: SchemaChange[],
  statements: string[]
): void {
  const actualColumns = byName(actual.columns);
  const desiredColumns = byName(desired.columns);

  for (const column of desired.columns) {
    const existing = actualColumns.get(column.name);
    if (!existing) {
      if (canAddColumn(column)) {
        additive.push({
          kind: "add_column",
          table: desired.name,
          column: column.name,
        });
        statements.push(emitAddColumn(desired.name, column));
      } else {
        blocking.push({
          kind: "alter_column",
          table: desired.name,
          column: column.name,
          reason:
            "new column is NOT NULL with no default; existing rows would have no value for it",
        });
      }
      continue;
    }

    if (existing.type.toLowerCase() !== column.type.toLowerCase()) {
      blocking.push({
        kind: "alter_column",
        table: desired.name,
        column: column.name,
        reason: `type changed from ${existing.type} to ${column.type}; SQLite cannot alter a column type in place`,
      });
    } else if (column.notNull && !existing.notNull) {
      blocking.push({
        kind: "alter_column",
        table: desired.name,
        column: column.name,
        reason:
          "column became NOT NULL; existing rows may hold nulls that cannot be filled automatically",
      });
    }
  }

  for (const column of actual.columns) {
    if (!desiredColumns.has(column.name)) {
      blocking.push({
        kind: "drop_column",
        table: desired.name,
        column: column.name,
        reason: "column no longer declared; dropping it would discard its data",
      });
    }
  }
}

function diffPrimaryKey(
  desired: TableSpec,
  actual: TableSpec,
  blocking: SchemaChange[]
): void {
  const same =
    desired.primaryKey.length === actual.primaryKey.length &&
    desired.primaryKey.every((c, i) => c === actual.primaryKey[i]);
  if (same) {
    return;
  }
  blocking.push({
    kind: "alter_primary_key",
    table: desired.name,
    reason: `primary key changed from (${actual.primaryKey.join(", ")}) to (${desired.primaryKey.join(", ")}); SQLite cannot alter a primary key in place`,
  });
}

function diffIndexes(
  desired: TableSpec,
  actual: TableSpec,
  additive: SchemaChange[],
  statements: string[]
): void {
  const actualIndexes = byName(actual.indexes);
  for (const index of desired.indexes) {
    if (!actualIndexes.has(index.name)) {
      additive.push({
        kind: "create_index",
        table: desired.name,
        index: index.name,
      });
      statements.push(emitCreateIndex(desired.name, index));
    }
  }
}

/**
 * What must happen for `actual` to satisfy `desired`.
 *
 * Reserved tables are excluded from both sides before comparing, so the app's
 * schema is diffed only against the app's own tables.
 *
 * Two things are deliberately not compared. A dropped index is not reported at
 * all: an index carries no data, and its absence from the declaration is far
 * more often a refactor than an intent to drop, so reporting it would refuse
 * publishes for a change that cannot lose anything. Foreign keys are likewise
 * only emitted with a new table — SQLite cannot add or remove a constraint on
 * an existing one, so a diff could describe the change but never perform it.
 */
export function diffSchema(
  actual: SchemaSnapshot,
  desired: SchemaSnapshot
): SchemaDiff {
  const additive: SchemaChange[] = [];
  const blocking: SchemaChange[] = [];
  const statements: string[] = [];

  const actualTables = byName(
    actual.tables.filter((t) => !isReservedTable(t.name))
  );
  const desiredTables = desired.tables.filter((t) => !isReservedTable(t.name));

  for (const table of desiredTables) {
    const existing = actualTables.get(table.name);
    if (!existing) {
      additive.push({ kind: "create_table", table: table.name });
      statements.push(emitCreateTable(table));
      for (const index of table.indexes) {
        additive.push({
          kind: "create_index",
          table: table.name,
          index: index.name,
        });
        statements.push(emitCreateIndex(table.name, index));
      }
      continue;
    }
    diffColumns(table, existing, additive, blocking, statements);
    diffPrimaryKey(table, existing, blocking);
    diffIndexes(table, existing, additive, statements);
  }

  const desiredNames = new Set(desiredTables.map((t) => t.name));
  for (const table of actualTables.values()) {
    if (!desiredNames.has(table.name)) {
      blocking.push({
        kind: "drop_table",
        table: table.name,
        reason:
          "table no longer declared; it may have been renamed or dropped, and either way its rows would be discarded",
      });
    }
  }

  return { additive, blocking, statements };
}

/**
 * Reading a snapshot back out of a real database — the `actual` half.
 *
 * It lives beside the emitter rather than in its own module because the two
 * are one mapping read in opposite directions: whatever `emitCreateTable`
 * writes, this must recover unchanged. `schema-roundtrip.test.ts` asserts
 * exactly that against real SQLite, and a disagreement between them would make
 * a deploy diff a schema against itself and find changes that are not there.
 *
 * Takes an exec function rather than a `SqlStorage` so it is testable without
 * a live Durable Object; `AppDataDO` SQL introspection supplies the real one.
 */

/** One row of a query result, as `SqlStorageCursor.toArray()` returns it. */
type SqlRow = Record<string, unknown>;
export type ExecRows = (query: string) => SqlRow[];

function str(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

function num(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

/**
 * Everything SQLite accepts as a bare column default. The list is closed: a
 * default that is not one of these is an expression, and SQLite requires those
 * to be parenthesised.
 */
const LITERAL_DEFAULT_RE =
  /^(?:null|true|false|current_(?:time|date|timestamp)|[+-]?\d+(?:\.\d+)?(?:e[+-]?\d+)?|'(?:[^']|'')*'|x'[0-9a-f]*')$/i;

/**
 * Put back the parentheses SQLite removes.
 *
 * `PRAGMA table_info` reports an expression default with its outer pair
 * stripped, so `DEFAULT (cast(...))` reads back as `cast(...)` — which is a
 * syntax error if emitted again. Nothing re-emits an introspected default
 * today, but restoring it here is what keeps that from becoming true later,
 * and it is what makes a snapshot compare equal whichever side produced it.
 */
function normalizeDefaultSql(raw: string): string {
  const value = raw.trim();
  if (LITERAL_DEFAULT_RE.test(value)) {
    return value;
  }
  if (value.startsWith("(") && value.endsWith(")")) {
    return value;
  }
  return `(${value})`;
}

/**
 * `PRAGMA` will not accept a bound parameter for its argument, so names are
 * interpolated. They come from `sqlite_master` and go through the same `quote`
 * the emitter uses, so a name can only reach here by having been created from
 * DDL this module already wrote.
 */
function readColumns(
  exec: ExecRows,
  tableName: string
): { columns: ColumnSpec[]; primaryKey: string[] } {
  const rows = exec(`PRAGMA table_info(${quote(tableName)})`);
  const columns = rows.map((row) => ({
    name: str(row.name),
    // SQLite echoes a declared type it does not recognise verbatim, but
    // rewrites the storage classes it does know to upper case — `text` comes
    // back `TEXT`. Drizzle reports them lower case, so canonicalising here is
    // what lets a snapshot from either side be compared, or logged, as one
    // shape.
    type: str(row.type).toLowerCase(),
    notNull: num(row.notnull) !== 0,
    defaultSql:
      row.dflt_value == null ? null : normalizeDefaultSql(str(row.dflt_value)),
  }));
  // `pk` is a 1-based position within the key, not a boolean, so sorting on it
  // is what recovers the declared column order of a composite key.
  const primaryKey = rows
    .filter((row) => num(row.pk) > 0)
    .sort((a, b) => num(a.pk) - num(b.pk))
    .map((row) => str(row.name));
  return { columns, primaryKey };
}

/**
 * Indexes SQLite created on its own are excluded. `origin` is `c` for an
 * explicit `CREATE INDEX`, `u` for one implied by a UNIQUE column constraint,
 * and `pk` for one backing a primary key. Only `c` has a counterpart in the
 * declaration — drizzle emits column-level `.unique()` as its own
 * `CREATE UNIQUE INDEX`, so those land here as `c` too.
 */
function readIndexes(exec: ExecRows, tableName: string): IndexSpec[] {
  const indexes: IndexSpec[] = [];
  for (const row of exec(`PRAGMA index_list(${quote(tableName)})`)) {
    const name = str(row.name);
    if (str(row.origin) !== "c" || name.startsWith("sqlite_autoindex")) {
      continue;
    }
    const columns = exec(`PRAGMA index_info(${quote(name)})`)
      .sort((a, b) => num(a.seqno) - num(b.seqno))
      // A null name marks an expression index, which has no column to compare.
      .map((r) => (r.name == null ? null : str(r.name)))
      .filter((c): c is string => c != null);
    indexes.push({ name, columns, unique: num(row.unique) !== 0 });
  }
  return indexes;
}

/**
 * Every table the database holds, reserved ones included — `diffSchema` does
 * the filtering, so it stays the one place that decides what is the app's own.
 *
 * Foreign keys come back empty on purpose. They are only ever emitted with a
 * new table, because SQLite cannot add or drop a constraint on an existing one,
 * so reading them would produce a field nothing is allowed to act on.
 */
export function introspectSchema(exec: ExecRows): SchemaSnapshot {
  const rows = exec(
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
  );
  return {
    tables: rows.map((row) => {
      const name = str(row.name);
      const { columns, primaryKey } = readColumns(exec, name);
      return {
        name,
        columns,
        primaryKey,
        indexes: readIndexes(exec, name),
        foreignKeys: [],
      } satisfies TableSpec;
    }),
  };
}

/**
 * Bring a snapshot the probe produced to the same form introspection yields.
 *
 * The two sides render the same table differently: drizzle reports types in
 * lower case and echoes a `sql` default exactly as the app wrote it, while
 * SQLite upper-cases the types it knows and strips an expression default's
 * outer parentheses. Canonicalising here rather than at each producer is what
 * keeps `diffSchema` comparing schemas instead of comparing spellings.
 */
export function canonicalizeSnapshot(snapshot: SchemaSnapshot): SchemaSnapshot {
  return {
    tables: snapshot.tables.map((table) => ({
      ...table,
      columns: table.columns.map((column) => ({
        ...column,
        type: column.type.toLowerCase(),
        defaultSql:
          column.defaultSql == null
            ? null
            : normalizeDefaultSql(column.defaultSql),
      })),
    })),
  };
}
