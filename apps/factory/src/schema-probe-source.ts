/**
 * The source of the probe worker — the code that runs inside an app's own
 * bundle to report what schema it declares.
 *
 * Split from `schema-probe.ts`, which compiles and loads it, for one reason:
 * this half is a pure function of a path, so it can be executed directly
 * against real drizzle in a test. The transport around it is machinery already
 * proven by the server bundle; the drizzle-internals knowledge encoded here is
 * the part that can be subtly wrong, so it is the part that must be testable.
 */

/**
 * Runs inside the app's bundle, so it may use drizzle freely — and must not
 * import anything from the factory, which is not in scope there.
 *
 * Two subtleties this encodes, both verified against drizzle 0.45.2 rather than
 * assumed. `hasDefault` is true for a column carrying only `$onUpdate`, which
 * has no SQL default at all, so the presence of `default` is the real test.
 * And `uniqueName` is populated on every column whether or not it is unique,
 * so `isUnique` is the one to branch on — reading the name would invent a
 * unique index on every column in the app.
 */
export function probeEntrySource(schemaEntry: string): string {
  const relative = `./${schemaEntry.slice("src/".length)}`;
  return `
import { is, SQL } from "drizzle-orm";
import {
  getTableConfig,
  SQLiteSyncDialect,
  SQLiteTable,
} from "drizzle-orm/sqlite-core";
import * as schema from ${JSON.stringify(relative)};

const dialect = new SQLiteSyncDialect();

function literal(value) {
  if (value === null) {
    return "null";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  return "'" + String(value).replace(/'/g, "''") + "'";
}

function defaultSql(column) {
  if (column.default === undefined) {
    return null;
  }
  if (is(column.default, SQL)) {
    return dialect.sqlToQuery(column.default).sql;
  }
  return literal(column.default);
}

function indexColumns(columns) {
  const names = [];
  for (const column of columns ?? []) {
    if (column && typeof column.name === "string") {
      names.push(column.name);
    }
  }
  return names;
}

function tableSpec(table) {
  const config = getTableConfig(table);

  const columns = config.columns.map((column) => ({
    name: column.name,
    type: column.getSQLType(),
    notNull: column.notNull,
    defaultSql: defaultSql(column),
  }));

  const composite = config.primaryKeys[0];
  const primaryKey = composite
    ? indexColumns(composite.columns)
    : config.columns.filter((c) => c.primary).map((c) => c.name);

  const indexes = [];
  for (const column of config.columns) {
    if (column.isUnique && column.uniqueName) {
      indexes.push({
        name: column.uniqueName,
        columns: [column.name],
        unique: true,
      });
    }
  }
  for (const constraint of config.uniqueConstraints ?? []) {
    if (constraint.name) {
      indexes.push({
        name: constraint.name,
        columns: indexColumns(constraint.columns),
        unique: true,
      });
    }
  }
  for (const index of config.indexes) {
    const cfg = index.config;
    if (cfg?.name) {
      indexes.push({
        name: cfg.name,
        columns: indexColumns(cfg.columns),
        unique: Boolean(cfg.unique),
      });
    }
  }

  const foreignKeys = config.foreignKeys.map((fk) => {
    const ref = fk.reference();
    return {
      columns: ref.columns.map((c) => c.name),
      refTable: getTableConfig(ref.foreignTable).name,
      refColumns: ref.foreignColumns.map((c) => c.name),
      onUpdate: fk.onUpdate ?? "no action",
      onDelete: fk.onDelete ?? "no action",
    };
  });

  return { name: config.name, columns, primaryKey, indexes, foreignKeys };
}

export default {
  fetch() {
    try {
      const tables = [];
      for (const value of Object.values(schema)) {
        if (is(value, SQLiteTable)) {
          tables.push(tableSpec(value));
        }
      }
      return Response.json({ ok: true, tables });
    } catch (e) {
      return Response.json({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },
};
`.trim();
}
