/**
 * Do accurate cheap vendor .d.ts stay near the `any`-stub heaps, and still
 * catch real type errors?
 *
 *   node scripts/run-measure.mjs measure-typed-stubs.ts
 *
 * Same server-entities import-closure roots as measure-stub-vfs. Local heap
 * is an indicator. The `any` rows are the previous experiment; this file
 * asks whether `any` was doing the work.
 */

import { TYPES_VFS } from "@sfab-lite/kernel";
import seed from "@sfab-lite/template/seed" with { type: "json" };
import type ts from "typescript";
import { createAppLsState, getLanguageService } from "../src/ls-host.ts";

const SERVER_ENTITIES = "/app/src/hono/org-protected/entities.ts";

const AMBIENT_ROOTS: string[] = [
  "/types/cloudflare-ambient.d.ts",
  ...Object.keys(TYPES_VFS)
    .filter((k) => k.startsWith("/libs/lib.") && k.endsWith(".d.ts"))
    .sort(),
];

const ANY_STUB = `
export declare const and: any;
export declare const asc: any;
export declare const count: any;
export declare const desc: any;
export declare const eq: any;
export declare const sql: any;
export declare const relations: any;
export declare const notExists: any;
export declare const drizzle: any;
export declare const index: any;
export declare const integer: any;
export declare const sqliteTable: any;
export declare const text: any;
export declare const uniqueIndex: any;
export declare const validator: any;
export declare const createMiddleware: any;
export declare const hc: any;
export declare const flattenError: any;
export declare const z: any;
export declare const betterAuth: any;
export declare const drizzleAdapter: any;
export declare const organization: any;
export declare const Hono: any;
export type ErrorHandler = any;
export type ZodType = any;
declare const _default: any;
export default _default;
`.trim();

const DRIZZLE_TYPED = `
export interface SQL { readonly __sqlBrand: true; }
export interface Column<T = unknown> {
  readonly __columnType: T;
  primaryKey(): Column<T>;
  notNull(): Column<Exclude<T, null>>;
  unique(): Column<T>;
  default(value: T | SQL): Column<T>;
  $onUpdate(fn: () => T): Column<T>;
  references(fn: () => Column<unknown>, opts?: { onDelete?: string }): Column<T>;
}

export type RowOf<T> = {
  [K in keyof T]: T[K] extends Column<infer V> ? V : never;
};

export declare function sql(
  strings: TemplateStringsArray,
  ...values: unknown[]
): SQL;

export declare function eq<T>(left: Column<T>, right: T): SQL;
export declare function and(...clauses: SQL[]): SQL;
export declare function asc(column: Column<unknown>): SQL;
export declare function desc(column: Column<unknown>): SQL;
export declare function count(): Column<number>;
export declare function notExists(query: unknown): SQL;

export declare function relations(
  table: object,
  fn: (helpers: {
    one: (...args: unknown[]) => unknown;
    many: (...args: unknown[]) => unknown;
  }) => unknown
): unknown;

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
  [K in keyof T]?: T[K] extends Column<infer V> ? V : never;
};

export interface Database {
  select(): Query<Record<string, never>>;
  select<S extends Record<string, Column<unknown>>>(
    shape: S
  ): Query<RowOf<S>>;
  insert<T extends Record<string, Column<unknown>>>(table: T): {
    values(row: InsertValues<T>): {
      returning(): Promise<Array<RowOf<T>>>;
    };
  };
  update<T extends Record<string, Column<unknown>>>(table: T): {
    set(row: InsertValues<T>): {
      where(clause: SQL): {
        returning(): Promise<Array<RowOf<T>>>;
      };
    };
  };
  delete<T extends Record<string, Column<unknown>>>(table: T): {
    where(clause: SQL): {
      returning(): Promise<Array<RowOf<T>>>;
    };
  };
  query: Record<
    string,
    {
      findFirst: (opts?: { where?: SQL }) => Promise<
        Record<string, unknown> | undefined
      >;
    }
  >;
}

export declare function drizzle(
  db: D1Database,
  opts?: { schema?: object }
): Database;

export declare function sqliteTable<Cols extends Record<string, Column<unknown>>>(
  name: string,
  columns: Cols,
  extra?: (table: Cols) => unknown[]
): Cols;

export declare function text(name: string): Column<string | null>;
export declare function integer(name: string): Column<number | null>;
export declare function integer(
  name: string,
  opts: { mode: "timestamp_ms" }
): Column<Date | null>;
export declare function integer(
  name: string,
  opts: { mode: "boolean" }
): Column<boolean | null>;

export declare function index(name: string): {
  on(...columns: Column<unknown>[]): unknown;
};
export declare function uniqueIndex(name: string): {
  on(...columns: Column<unknown>[]): unknown;
};
`.trim();

const HONO_TYPED = `
export type EnvBase = {
  Bindings?: object;
  Variables?: Record<string, unknown>;
};

export type Validator<T> = { readonly __valid: T };

export type Context<E extends EnvBase = EnvBase, V = unknown> = {
  get<K extends keyof NonNullable<E["Variables"]>>(
    key: K
  ): NonNullable<E["Variables"]>[K];
  json(body: unknown, status?: number): Response;
  req: {
    param(name: string): string;
    valid(target: "json"): V;
    raw: Request;
  };
};

export type Handler<E extends EnvBase = EnvBase, V = unknown> = (
  c: Context<E, V>
) => unknown | Promise<unknown>;

export type ErrorHandler = (
  err: Error,
  c: Context
) => Response | Promise<Response>;

export declare class Hono<E extends EnvBase = EnvBase> {
  get(path: string, handler: Handler<E>): this;
  post<T>(path: string, v: Validator<T>, handler: Handler<E, T>): this;
  post(path: string, handler: Handler<E>): this;
  patch<T>(path: string, v: Validator<T>, handler: Handler<E, T>): this;
  patch(path: string, handler: Handler<E>): this;
  delete(path: string, handler: Handler<E>): this;
  use(path: string, handler: Handler<E>): this;
  route(path: string, app: Hono<E>): this;
  onError(handler: ErrorHandler): this;
  basePath(path: string): this;
  on(event: string, handler: Handler<E>): this;
}

export declare function validator<T>(
  target: "json",
  fn: (value: unknown, c: Context) => T | Response
): Validator<T>;

export declare function createMiddleware<E extends EnvBase>(
  fn: (c: Context<E>, next: () => Promise<void>) => unknown
): Handler<E>;
`.trim();

const files: Record<string, string> = {};
for (const [path, text] of Object.entries(
  seed.sourceFiles as Record<string, string>
)) {
  if (path.endsWith(".ts") || path.endsWith(".tsx")) {
    files[`/app/${path}`] = text;
  }
}

const healthyEntities = files[SERVER_ENTITIES] ?? "";
const brokenEntities = healthyEntities
  .replace("eq(entity.id, id)", "eq(entity.id, 0)")
  .replace("name: input.name,", "name: 123,");

if (brokenEntities === healthyEntities) {
  throw new Error("broken overlay did not change entities.ts");
}

function heapMb(): number {
  global.gc?.();
  global.gc?.();
  global.gc?.();
  return process.memoryUsage().heapUsed / 1_048_576;
}

function matchesPrefix(key: string, prefix: string): boolean {
  return key === prefix || key.startsWith(`${prefix}/`);
}

type Kind = "none" | "any" | "typed";

const DRIZZLE = ["/node_modules/drizzle-orm"];
const HONO = ["/node_modules/hono"];
const AUTH = [
  "/node_modules/better-auth",
  "/node_modules/@better-auth",
  "/node_modules/better-call",
];

function textFor(prefix: string, kind: Kind): string {
  if (kind === "any") {
    return ANY_STUB;
  }
  if (prefix.startsWith("/node_modules/drizzle-orm")) {
    return DRIZZLE_TYPED;
  }
  if (prefix.startsWith("/node_modules/hono")) {
    return HONO_TYPED;
  }
  return ANY_STUB;
}

function overlayVendors(
  overlay: Map<string, string>,
  versions: Map<string, number>,
  specs: { prefixes: string[]; kind: Kind }[]
): number {
  let n = 0;
  for (const key of Object.keys(TYPES_VFS)) {
    for (const spec of specs) {
      const prefix = spec.prefixes.find((p) => matchesPrefix(key, p));
      if (prefix) {
        overlay.set(key, textFor(prefix, spec.kind));
        versions.set(key, 1);
        n += 1;
        break;
      }
    }
  }
  return n;
}

function diagSummary(diags: readonly ts.Diagnostic[]): string[] {
  return diags.slice(0, 8).map((d) => {
    const msg =
      typeof d.messageText === "string"
        ? d.messageText
        : d.messageText.messageText;
    return `TS${d.code}: ${msg}`;
  });
}

function measure(
  label: string,
  specs: { prefixes: string[]; kind: Kind }[],
  entitiesSrc: string
) {
  const before = heapMb();
  const st = createAppLsState();
  for (const [p, text] of Object.entries(files)) {
    st.overlay.set(p, text);
    st.versions.set(p, 1);
  }
  st.overlay.set(SERVER_ENTITIES, entitiesSrc);
  st.versions.set(SERVER_ENTITIES, 1);
  const stubbedFiles = overlayVendors(st.overlay, st.versions, specs);
  st.rootFiles = [SERVER_ENTITIES, ...AMBIENT_ROOTS];
  const ls = getLanguageService(st);

  const t0 = Date.now();
  const diags = ls.getSemanticDiagnostics(SERVER_ENTITIES);
  const ms = Date.now() - t0;

  const p = ls.getProgram();
  const sfs = p ? p.getSourceFiles() : [];
  const bytes = sfs.reduce((n, s) => n + s.text.length, 0);
  const after = heapMb();
  const row = {
    label,
    stubbedFiles,
    loadedFiles: sfs.length,
    loadedTextMb: Number((bytes / 1_048_576).toFixed(2)),
    diagnostics: diags.length,
    diagnosticSample: diagSummary(diags),
    ms,
    heapRetainedMb: Number((after - before).toFixed(0)),
  };
  console.log(JSON.stringify(row));
  return row;
}

measure("server entities, real VFS", [], healthyEntities);
measure("any drizzle", [{ prefixes: DRIZZLE, kind: "any" }], healthyEntities);
measure(
  "typed drizzle",
  [{ prefixes: DRIZZLE, kind: "typed" }],
  healthyEntities
);
measure(
  "typed drizzle + any better-auth",
  [
    { prefixes: DRIZZLE, kind: "typed" },
    { prefixes: AUTH, kind: "any" },
  ],
  healthyEntities
);
measure(
  "any drizzle + hono",
  [
    { prefixes: DRIZZLE, kind: "any" },
    { prefixes: HONO, kind: "any" },
  ],
  healthyEntities
);
measure(
  "typed drizzle + hono",
  [
    { prefixes: DRIZZLE, kind: "typed" },
    { prefixes: HONO, kind: "typed" },
  ],
  healthyEntities
);

measure("broken entities, real VFS", [], brokenEntities);
measure(
  "broken entities, any drizzle + hono",
  [
    { prefixes: DRIZZLE, kind: "any" },
    { prefixes: HONO, kind: "any" },
  ],
  brokenEntities
);
measure(
  "broken entities, typed drizzle + hono",
  [
    { prefixes: DRIZZLE, kind: "typed" },
    { prefixes: HONO, kind: "typed" },
  ],
  brokenEntities
);
