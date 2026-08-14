/**
 * Drop drizzle's non-SQLite dialects from the types VFS.
 *
 * sfab-lite apps run on D1. Postgres, MySQL, Gel and SingleStore are not
 * reachable from a sub-app and never will be — but the check worker was
 * loading all four anyway, because `column-builder.d.ts` declares three type
 * aliases that dispatch on a `TDialect` type parameter and name a column class
 * per dialect in each conditional branch:
 *
 *   BuildColumn           TDialect extends 'pg' ? PgColumn<…> : … : never
 *   BuildIndexColumn      TDialect extends 'pg' ? ExtraConfigColumn : …
 *   ChangeColumnTableName TDialect extends 'pg' ? PgColumn<…> : … : never
 *
 * A D1 app is always `TDialect = 'sqlite'`, so those branches never
 * instantiate. TypeScript still has to *resolve* the type references inside
 * them, which pulls in all four dialect modules: 232 of drizzle's 301 loaded
 * files, 690 KB of `.d.ts`.
 *
 * Rewriting the three aliases to their sqlite branch and dropping the four
 * imports took the check worker's program from 877 source files / 330 MB of
 * retained heap to 645 / 263 MB, and its production `exceededMemory` rate from
 * 36% (4 of 11 calls) to 0 of 64. See
 * `docs/notes/2026-07-25-check-worker-memory.md`.
 *
 * This runs as a read filter during the closure build rather than as a patch
 * to `node_modules`, so `pnpm install` stays idempotent and the transform is
 * ordinary reviewable code. Every edit asserts on the text it expects, so a
 * drizzle bump that reshapes this file fails the build loudly instead of
 * silently un-slimming the VFS.
 */

const TARGET_SUFFIX = "/drizzle-orm/column-builder.d.ts";

/** Dialect modules whose imports exist only to feed unreachable branches. */
const DEAD_DIALECT_MODULES = [
  "gel-core",
  "mysql-core",
  "pg-core",
  "singlestore-core",
];

const BUILD_COLUMN =
  "export type BuildColumn<TTableName extends string, TBuilder extends ColumnBuilderBase, " +
  "TDialect extends Dialect> = TDialect extends 'sqlite' ? SQLiteColumn<" +
  "MakeColumnConfig<TBuilder['_'], TTableName>, {}, Simplify<Omit<TBuilder['_'], " +
  "keyof MakeColumnConfig<TBuilder['_'], TTableName> | 'brand' | 'dialect'>>> : " +
  "TDialect extends 'common' ? Column<MakeColumnConfig<TBuilder['_'], TTableName>, {}, " +
  "Simplify<Omit<TBuilder['_'], keyof MakeColumnConfig<TBuilder['_'], TTableName> | " +
  "'brand' | 'dialect'>>> : never;";

// Both remaining arms were pg/gel only, so sqlite already resolved to `never`.
const BUILD_INDEX_COLUMN =
  "export type BuildIndexColumn<TDialect extends Dialect> = TDialect extends Dialect ? never : never;";

const CHANGE_COLUMN_TABLE_NAME =
  "export type ChangeColumnTableName<TColumn extends Column, TAlias extends string, " +
  "TDialect extends Dialect> = TDialect extends 'sqlite' ? SQLiteColumn<" +
  "MakeColumnConfig<TColumn['_'], TAlias>> : never;";

/** @param {string} absPath */
export function isTrimTarget(absPath) {
  return absPath.replaceAll("\\", "/").endsWith(TARGET_SUFFIX);
}

/**
 * Replace the one line starting with `prefix`. Throws when absent, which is
 * the whole point: silence here would mean a VFS quietly twice the size.
 * @param {string[]} lines
 * @param {string} prefix
 * @param {string} next
 */
function replaceLine(lines, prefix, next) {
  const i = lines.findIndex((l) => l.startsWith(prefix));
  if (i === -1) {
    throw new Error(
      `trim-drizzle-dialects: no line starting with ${JSON.stringify(prefix)} ` +
        "in column-builder.d.ts — drizzle changed shape; re-derive the trim " +
        "(see docs/notes/2026-07-25-check-worker-memory.md) rather than " +
        "deleting this gate."
    );
  }
  lines[i] = next;
}

/**
 * @param {string} text original column-builder.d.ts
 * @returns {string} sqlite-only column-builder.d.ts
 */
export function trimDrizzleDialects(text) {
  const lines = text.split("\n");

  for (const spec of DEAD_DIALECT_MODULES) {
    const i = lines.findIndex(
      (l) => l.startsWith("import type") && l.includes(`./${spec}/index.js`)
    );
    if (i === -1) {
      throw new Error(
        `trim-drizzle-dialects: expected an import of ./${spec}/index.js`
      );
    }
    lines[i] = "";
  }

  // The one non-conditional use: a Postgres identity-sequence option bag on
  // GeneratedIdentityConfig, which SQLite never produces.
  replaceLine(
    lines,
    "    sequenceOptions?: PgSequenceOptions;",
    "    sequenceOptions?: unknown;"
  );

  replaceLine(lines, "export type BuildColumn<", BUILD_COLUMN);
  replaceLine(lines, "export type BuildIndexColumn<", BUILD_INDEX_COLUMN);
  replaceLine(
    lines,
    "export type ChangeColumnTableName<",
    CHANGE_COLUMN_TABLE_NAME
  );

  const out = lines.join("\n");
  const leftover = out.match(
    /gel-core|mysql-core|pg-core|singlestore-core|PgColumn|MySqlColumn|GelColumn|SingleStoreColumn/g
  );
  if (leftover) {
    throw new Error(
      `trim-drizzle-dialects: ${leftover.length} dialect reference(s) survived ` +
        `(${[...new Set(leftover)].join(", ")}) — the trim is incomplete and ` +
        "the dialect modules would still be pulled into the program."
    );
  }
  return out;
}
