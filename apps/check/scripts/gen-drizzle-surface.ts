/**
 * Spike: generate a cheap drizzle .d.ts from template usage + universe
 * drizzle-orm declarations. Seams (Column / Query / sqliteTable DSL) are
 * hand-curated; the inventory is generated. See
 * docs/notes/2026-08-14-generator-spike.md.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const repoRoot = join(process.cwd(), "../..");

const TEMPLATE_SRC = join(repoRoot, "packages/template/app/src");
const UNIVERSE_DRIZZLE = join(
  repoRoot,
  "packages/kernel/universe/node_modules/drizzle-orm"
);

const DEAD_DIALECTS = new Set([
  "pg-core",
  "mysql-core",
  "gel-core",
  "singlestore-core",
]);

const IMPORT_RE =
  /import\s+(?:type\s+)?(?:\{([^}]+)\}|\*\s+as\s+\w+|\w+)\s+from\s+["'](drizzle-orm(?:\/[^"']+)?)["']/g;

const SUPPORT = `
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

const SEAMS: Record<string, string> = {
  sql: `export declare function sql(
  strings: TemplateStringsArray,
  ...values: unknown[]
): SQL;`,
  eq: "export declare function eq<T>(left: Column<T>, right: T | null): SQL;",
  and: "export declare function and(...clauses: SQL[]): SQL;",
  asc: "export declare function asc(column: Column<unknown>): SQL;",
  desc: "export declare function desc(column: Column<unknown>): SQL;",
  count:
    "export declare function count(expression?: Column<unknown> | SQL): Column<number>;",
  notExists: "export declare function notExists(query: unknown): SQL;",
  relations: `export declare function relations(
  table: object,
  fn: (helpers: {
    one: (...args: unknown[]) => unknown;
    many: (...args: unknown[]) => unknown;
  }) => unknown
): unknown;`,
  drizzle: `export declare function drizzle(
  db: D1Database,
  opts?: { schema?: object }
): Database;`,
  sqliteTable: `export declare function sqliteTable<Cols extends Record<string, Column<unknown>>>(
  name: string,
  columns: Cols,
  extra?: (table: Cols) => unknown[]
): Cols;`,
  text: "export declare function text(name: string, opts?: object): Column<string | null>;",
  integer: `export declare function integer(name: string): Column<number | null>;
export declare function integer(
  name: string,
  opts: { mode: "timestamp_ms" }
): Column<Date | null>;
export declare function integer(
  name: string,
  opts: { mode: "boolean" }
): Column<boolean | null>;`,
  index: `export declare function index(name: string): {
  on(...columns: Column<unknown>[]): unknown;
};`,
  uniqueIndex: `export declare function uniqueIndex(name: string): {
  on(...columns: Column<unknown>[]): unknown;
};`,
};

const TYPE_PREFIX_RE = /^type\s+/;
const AS_SPLIT_RE = /\s+as\s+/;
const EXPORT_DECL = (name: string) =>
  new RegExp(
    String.raw`export\s+declare\s+(?:async\s+)?(?:function|const|class|type|interface)\s+${name}\b|export\s+declare\s+const\s+${name}\s*:|export\s+type\s+${name}\b|export\s+\{[^}]*\b${name}\b`
  );

export interface UsageHit {
  file: string;
  specifier: string;
  names: string[];
}

export interface UniverseHit {
  name: string;
  specifier: string;
  file: string;
  snippet: string;
}

export interface GenResult {
  text: string;
  usage: UsageHit[];
  usedNames: string[];
  seamsUsed: string[];
  missingSeams: string[];
  universeHits: UniverseHit[];
  missingUniverse: string[];
}

function walkTs(dir: string, out: string[]): void {
  for (const ent of readdirSync(dir)) {
    const p = join(dir, ent);
    const st = statSync(p);
    if (st.isDirectory()) {
      walkTs(p, out);
    } else if (ent.endsWith(".ts") || ent.endsWith(".tsx")) {
      out.push(p);
    }
  }
}

function namedImports(clause: string): string[] {
  return clause
    .split(",")
    .map((part) => {
      const bit = part.trim();
      if (!bit || bit.startsWith("type ")) {
        const inner = bit.replace(TYPE_PREFIX_RE, "").trim();
        const as = inner.split(AS_SPLIT_RE);
        return (as[0] ?? "").trim();
      }
      const as = bit.split(AS_SPLIT_RE);
      return (as[0] ?? "").trim();
    })
    .filter((n) => n && n !== "type");
}

function collectUsage(srcRoot: string): UsageHit[] {
  const files: string[] = [];
  walkTs(srcRoot, files);
  const hits: UsageHit[] = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    IMPORT_RE.lastIndex = 0;
    for (;;) {
      const m = IMPORT_RE.exec(text);
      if (!m) {
        break;
      }
      const names = m[1] ? namedImports(m[1]) : [];
      if (names.length === 0) {
        continue;
      }
      hits.push({
        file: relative(srcRoot, file),
        specifier: m[2] ?? "drizzle-orm",
        names,
      });
    }
  }
  return hits;
}

function walkDts(dir: string, out: string[]): void {
  let ents: string[];
  try {
    ents = readdirSync(dir);
  } catch {
    return;
  }
  for (const ent of ents) {
    if (DEAD_DIALECTS.has(ent)) {
      continue;
    }
    const p = join(dir, ent);
    const st = statSync(p);
    if (st.isDirectory()) {
      walkDts(p, out);
    } else if (ent.endsWith(".d.ts")) {
      out.push(p);
    }
  }
}

function startDirFor(specifier: string): string {
  if (specifier === "drizzle-orm") {
    return UNIVERSE_DRIZZLE;
  }
  const rest = specifier.slice("drizzle-orm/".length);
  return join(UNIVERSE_DRIZZLE, rest);
}

function findExport(name: string, specifier: string): UniverseHit | null {
  const start = startDirFor(specifier);
  const files: string[] = [];
  const st = statSync(start);
  if (st.isFile()) {
    files.push(start);
  } else {
    walkDts(start, files);
  }
  const exportRe = EXPORT_DECL(name);
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const idx = text.search(exportRe);
    if (idx < 0) {
      continue;
    }
    const lineStart = text.lastIndexOf("\n", idx) + 1;
    const lineEnd = text.indexOf("\n", idx);
    const snippet = text
      .slice(lineStart, lineEnd < 0 ? undefined : lineEnd)
      .trim();
    return {
      name,
      specifier,
      file: relative(UNIVERSE_DRIZZLE, file),
      snippet,
    };
  }
  return null;
}

export function generateDrizzleSurface(srcRoot = TEMPLATE_SRC): GenResult {
  const usage = collectUsage(srcRoot);
  const used = new Set<string>();
  const specFor = new Map<string, string>();
  for (const hit of usage) {
    for (const name of hit.names) {
      used.add(name);
      if (!specFor.has(name)) {
        specFor.set(name, hit.specifier);
      }
    }
  }
  const usedNames = [...used].sort((a, b) => a.localeCompare(b));
  const missingSeams: string[] = [];
  const seamsUsed: string[] = [];
  const universeHits: UniverseHit[] = [];
  const missingUniverse: string[] = [];

  for (const name of usedNames) {
    if (SEAMS[name]) {
      seamsUsed.push(name);
    } else {
      missingSeams.push(name);
    }
    const spec = specFor.get(name) ?? "drizzle-orm";
    const hit = findExport(name, spec);
    if (hit) {
      universeHits.push(hit);
    } else {
      missingUniverse.push(`${spec}#${name}`);
    }
  }

  const parts = [SUPPORT];
  for (const name of seamsUsed) {
    const seam = SEAMS[name];
    if (seam) {
      parts.push(seam);
    }
  }

  return {
    text: parts.join("\n\n").trim(),
    usage,
    usedNames,
    seamsUsed,
    missingSeams,
    universeHits,
    missingUniverse,
  };
}
