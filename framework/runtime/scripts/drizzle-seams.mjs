/**
 * Curated cheap sqlite/D1 seams for drizzle-orm. Universe `.d.ts` is an
 * existence check only — real signatures cannot be copied (they are
 * BinaryOperator / SQLiteTableFn / dialect builders; copying re-opens the
 * graphs ADR-0004 closed). Design input:
 * docs/notes/2026-08-14-generator-spike.md
 */

export const SUPPORT_WHY = {
  Column:
    "Real column types are dialect builder graphs (SQLiteTextBuilderInitial, SQLiteIntegerBuilderInitial).",
  Query:
    "Real query builders are dialect-generic classes that pull column-builder.",
  Database:
    "Real drizzle() from d1 is DrizzleD1Database extending BaseSQLiteDatabase.",
  RowOf: "Cheap mapped row type; the real row graph rides the dialect tables.",
  InsertValues:
    "Allows V | SQL so .set({ totalCents: sql`…` }) typechecks; real insert types are dialect-specific.",
  SQL: "Brand-only stand-in; the real SQL class pulls the sql-js graph.",
};

export const SUPPORT = `
export interface SQL { readonly __sqlBrand: true; }
export interface Column<T = unknown> {
  readonly __columnType: T;
  primaryKey(): Column<Exclude<T, null>>;
  notNull(): Column<Exclude<T, null>>;
  unique(): Column<T>;
  default(value: T | SQL): Column<T>;
  $onUpdate(fn: () => T): Column<T>;
  references(fn: () => Column<unknown>, opts?: { onDelete?: string }): Column<T>;
}

export type RowOf<T> = {
  [K in keyof T]: T[K] extends Column<infer V> ? V : never;
};

export interface Query<Row> {
  from<T extends Record<string, Column<unknown>>>(
    table: T
  ): Query<Row extends Record<string, never> ? RowOf<T> : Row>;
  where(clause: SQL): Query<Row>;
  orderBy(...clauses: SQL[]): Query<Row>;
  limit(n: number): Query<Row>;
  then<TResult1 = Row[], TResult2 = never>(
    onfulfilled?: ((value: Row[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2>;
}

type InsertValues<T> = {
  [K in keyof T]?: T[K] extends Column<infer V> ? V | SQL : never;
};

export interface Database {
  select(): Query<Record<string, never>>;
  select<S extends Record<string, Column<unknown>>>(
    shape: S
  ): Query<RowOf<S>>;
  insert<T extends Record<string, Column<unknown>>>(table: T): {
    values(row: InsertValues<T> | Array<InsertValues<T>>): {
      onConflictDoNothing(): {
        returning(shape?: Record<string, Column<unknown>>): Promise<
          Array<RowOf<T>>
        >;
      };
      returning(shape?: Record<string, Column<unknown>>): Promise<
        Array<RowOf<T>>
      >;
    };
  };
  update<T extends Record<string, Column<unknown>>>(table: T): {
    set(row: InsertValues<T>): {
      where(clause: SQL): {
        returning(shape?: Record<string, Column<unknown>>): Promise<
          Array<RowOf<T>>
        >;
      };
    };
  };
  delete<T extends Record<string, Column<unknown>>>(table: T): {
    where(clause: SQL): {
      returning(shape?: Record<string, Column<unknown>>): Promise<
        Array<RowOf<T>>
      >;
    };
  };
  query: Record<
    string,
    {
      findFirst: (opts?: { where?: SQL }) => Promise<any>;
    }
  >;
}
`.trim();

export const NAME_SEAMS = [
  {
    name: "and",
    why: "Real and() is typed over SQLWrapper combinators that drag the sql-js graph.",
    decl: "export declare function and(...clauses: SQL[]): SQL;",
  },
  {
    name: "asc",
    why: "Real asc() takes AnyColumn / SQLWrapper; copying pulls column-builder.",
    decl: "export declare function asc(column: Column<unknown>): SQL;",
  },
  {
    name: "count",
    why: "Real count() takes an optional wrapper; a zero-arg-only seam missed documents.",
    decl: "export declare function count(expression?: Column<unknown> | SQL): Column<number>;",
  },
  {
    name: "desc",
    why: "Same as asc: real signature is dialect-generic over AnyColumn.",
    decl: "export declare function desc(column: Column<unknown>): SQL;",
  },
  {
    name: "drizzle",
    why: "Real drizzle() from d1 returns DrizzleD1Database; copying re-opens BaseSQLiteDatabase.",
    decl: `export declare function drizzle(
  db: D1Database,
  opts?: { schema?: object }
): Database;`,
  },
  {
    name: "eq",
    why: "Real eq is BinaryOperator; copying that alias re-opens the dialect graphs.",
    decl: "export declare function eq<T>(left: Column<T>, right: T | null): SQL;",
  },
  {
    name: "index",
    why: "Real index() returns a dialect ExtraConfigBuilder.",
    decl: `export declare function index(name: string): {
  on(...columns: Column<unknown>[]): unknown;
};`,
  },
  {
    name: "integer",
    why: "Real integer() returns SQLiteIntegerBuilderInitial; timestamp_ms / boolean overloads are sqlite-only seams.",
    decl: `export declare function integer(name: string): Column<number | null>;
export declare function integer(
  name: string,
  opts: { mode: "timestamp_ms" }
): Column<Date | null>;
export declare function integer(
  name: string,
  opts: { mode: "boolean" }
): Column<boolean | null>;`,
  },
  {
    name: "notExists",
    why: "Real notExists() takes a subquery wrapper type from the sql graph.",
    decl: "export declare function notExists(query: unknown): SQL;",
  },
  {
    name: "relations",
    why: "Real relations() is a generic over table config that pulls the relations graph.",
    decl: `export declare function relations(
  table: object,
  fn: (helpers: {
    one: (...args: unknown[]) => unknown;
    many: (...args: unknown[]) => unknown;
  }) => unknown
): unknown;`,
  },
  {
    name: "sql",
    why: "Real sql tagged template is the SQL class; copying pulls sql-js + dialect helpers.",
    decl: `export declare function sql(
  strings: TemplateStringsArray,
  ...values: unknown[]
): SQL;`,
  },
  {
    name: "sqliteTable",
    why: "Real sqliteTable is SQLiteTableFn; copying that alias re-opens sqlite-core builders.",
    decl: `export declare function sqliteTable<Cols extends Record<string, Column<unknown>>>(
  name: string,
  columns: Cols,
  extra?: (table: Cols) => unknown[]
): Cols;`,
  },
  {
    name: "text",
    why: 'Real text() returns SQLiteTextBuilderInitial. The enum overload keeps T[number] so client InferResponseType (EntityKind) stays "customer" | "vendor" instead of string — opts?: object alone failed seed typecheck on entities.tsx.',
    decl: `export declare function text<const T extends readonly string[]>(
  name: string,
  opts: { enum: T }
): Column<T[number] | null>;
export declare function text(name: string, opts?: object): Column<string | null>;`,
  },
  {
    name: "uniqueIndex",
    why: "Same as index: real uniqueIndex() is a dialect ExtraConfigBuilder.",
    decl: `export declare function uniqueIndex(name: string): {
  on(...columns: Column<unknown>[]): unknown;
};`,
  },
];

export const SEAM_NAMES = NAME_SEAMS.map((s) => s.name);

export const QUERY_ANY_WHY =
  "db.query.*.findFirst returns Promise<any> — not the long-term relational API; unblocks row.id in session-context. A typed Record<string, unknown> made row.id unusable.";
