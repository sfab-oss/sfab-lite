/**
 * Schema diffing and DDL emission for app migrations.
 *
 * The app's `src/db/schema.ts` declares tables; the app's Durable Object holds
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
  primaryKey: boolean;
  /** Rendered SQL for the default, or null. Expressions arrive parenthesised. */
  defaultSql: string | null;
}

interface IndexSpec {
  name: string;
  columns: string[];
  unique: boolean;
}

export interface TableSpec {
  name: string;
  columns: ColumnSpec[];
  indexes: IndexSpec[];
}

export interface SchemaSnapshot {
  tables: TableSpec[];
}

type SchemaChange =
  | { kind: "create_table"; table: string }
  | { kind: "add_column"; table: string; column: string }
  | { kind: "create_index"; table: string; index: string }
  | { kind: "drop_table"; table: string; reason: string }
  | { kind: "drop_column"; table: string; column: string; reason: string }
  | { kind: "alter_column"; table: string; column: string; reason: string };

export interface SchemaDiff {
  /** Changes this module can perform safely, with `statements` to perform them. */
  additive: SchemaChange[];
  /** Changes that need a human. Their presence must refuse the publish. */
  blocking: SchemaChange[];
  statements: string[];
}

/**
 * Tables the factory owns inside every app's DO. They are not part of the
 * app's schema and must never be diffed against it — treating them as
 * unexpected would report the factory's own bookkeeping as data loss.
 */
const RESERVED_TABLE_PREFIXES = ["_sfab_", "sqlite_"];

function isReservedTable(name: string): boolean {
  return RESERVED_TABLE_PREFIXES.some((p) => name.startsWith(p));
}

function quote(identifier: string): string {
  return `\`${identifier.replace(/`/g, "``")}\``;
}

/** Column definition body, shared by CREATE TABLE and ADD COLUMN. */
function columnDefinition(column: ColumnSpec): string {
  const parts = [quote(column.name), column.type];
  if (column.primaryKey) {
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

export function emitCreateTable(table: TableSpec): string {
  const columns = table.columns
    .map((c) => `\t${columnDefinition(c)}`)
    .join(",\n");
  return `CREATE TABLE ${quote(table.name)} (\n${columns}\n);`;
}

function emitAddColumn(tableName: string, column: ColumnSpec): string {
  return `ALTER TABLE ${quote(tableName)} ADD ${columnDefinition(column)};`;
}

function emitCreateIndex(tableName: string, index: IndexSpec): string {
  const unique = index.unique ? "UNIQUE " : "";
  const columns = index.columns.map(quote).join(",");
  return `CREATE ${unique}INDEX ${quote(index.name)} ON ${quote(tableName)} (${columns});`;
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

    if (existing.type !== column.type) {
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
    } else if (column.primaryKey !== existing.primaryKey) {
      blocking.push({
        kind: "alter_column",
        table: desired.name,
        column: column.name,
        reason:
          "primary key changed; SQLite cannot alter a primary key in place",
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
 * Reserved factory tables are excluded from both sides before comparing, so
 * the app's schema is diffed only against the app's own tables.
 *
 * A dropped index is not reported at all: an index carries no data, and its
 * absence from the declaration is far more often a refactor than an intent to
 * drop. Reporting it as blocking would refuse publishes for a change that
 * cannot lose anything.
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
