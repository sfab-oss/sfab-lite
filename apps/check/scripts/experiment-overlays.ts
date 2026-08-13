/**
 * Overlays for the stacked-winners experiment. Side-effect free so the
 * measure script can import them without re-running other harnesses.
 */

export const DRIZZLE_TYPED = `
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

export const HONO_TYPED = `
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

export const CLIENT = "/app/src/ui/lib/client.ts";
export const HOOK_ENTITIES = "/app/src/ui/hooks/use-entities.ts";

const SHALLOW_CLIENT = `
import { publicBase } from "./public-base";

const base = publicBase ? \`\${publicBase}/api\` : "/api";

function api(method: string, path: string, body?: unknown) {
  return fetch(\`\${base}\${path}\`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export const client = {
  protected: {
    entities: {
      $get: () => api("GET", "/protected/entities"),
      $post: (opts: { json: unknown }) =>
        api("POST", "/protected/entities", opts.json),
      ":id": {
        $patch: (opts: { param: { id: string }; json: unknown }) =>
          api("PATCH", \`/protected/entities/\${opts.param.id}\`, opts.json),
        $delete: (opts: { param: { id: string } }) =>
          api("DELETE", \`/protected/entities/\${opts.param.id}\`),
      },
    },
    products: {
      $get: () => api("GET", "/protected/products"),
      $post: (opts: { json: unknown }) =>
        api("POST", "/protected/products", opts.json),
      ":id": {
        $patch: (opts: { param: { id: string }; json: unknown }) =>
          api("PATCH", \`/protected/products/\${opts.param.id}\`, opts.json),
        $delete: (opts: { param: { id: string } }) =>
          api("DELETE", \`/protected/products/\${opts.param.id}\`),
      },
    },
    documents: {
      $get: () => api("GET", "/protected/documents"),
      $post: (opts: { json: unknown }) =>
        api("POST", "/protected/documents", opts.json),
      ":id": {
        $get: (opts: { param: { id: string } }) =>
          api("GET", \`/protected/documents/\${opts.param.id}\`),
        $delete: (opts: { param: { id: string } }) =>
          api("DELETE", \`/protected/documents/\${opts.param.id}\`),
        finalize: {
          $post: (opts: { param: { id: string } }) =>
            api("POST", \`/protected/documents/\${opts.param.id}/finalize\`),
        },
        lines: {
          $post: (opts: { param: { id: string }; json: unknown }) =>
            api("POST", \`/protected/documents/\${opts.param.id}/lines\`, opts.json),
          ":lineId": {
            $delete: (opts: { param: { id: string; lineId: string } }) =>
              api(
                "DELETE",
                \`/protected/documents/\${opts.param.id}/lines/\${opts.param.lineId}\`
              ),
          },
        },
      },
    },
    "session-context": {
      $get: () => api("GET", "/protected/session-context"),
    },
  },
};
`.trim();

const SHALLOW_ENTITIES_HOOK = `
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { z } from "zod";
import { entityCreateSchema } from "../../contract/entities";
import { client } from "../lib/client";

type EntitiesList = { data: Entity[] };
type Entity = {
  id: string;
  name: string;
  kind: "customer" | "vendor";
  email: string | null;
  taxId: string | null;
};
export type EntityKind = Entity["kind"];

const getEntitiesKey = () => ["entities"] as const;

export function useEntities() {
  return useQuery({
    queryKey: getEntitiesKey(),
    queryFn: async () => {
      const res = await client.protected.entities.$get();
      if (!res.ok) {
        throw new Error(\`entities \${res.status}\`);
      }
      const body = (await res.json()) as EntitiesList;
      return body.data;
    },
  });
}

type CreateEntityInput = z.infer<typeof entityCreateSchema>;

export function useCreateEntity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateEntityInput) => {
      const res = await client.protected.entities.$post({ json: input });
      if (!res.ok) {
        throw new Error(\`create entity \${res.status}\`);
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getEntitiesKey() });
    },
  });
}

export function useDeleteEntity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await client.protected.entities[":id"].$delete({
        param: { id },
      });
      if (!res.ok) {
        throw new Error(
          res.status === 409
            ? "That party has documents and cannot be deleted."
            : \`delete entity \${res.status}\`
        );
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getEntitiesKey() });
    },
  });
}
`.trim();

const SHALLOW_SESSION_HOOK = `
import { useQuery } from "@tanstack/react-query";
import { client } from "../lib/client";
import { queryClient } from "../lib/query-client";

export type Session =
  | {
      authenticated: false;
      needsOnboarding: boolean;
      user: null;
      session: null;
      organization: null;
    }
  | {
      authenticated: true;
      needsOnboarding: boolean;
      user: { id: string; email: string; name: string };
      session: { id: string; activeOrganizationId: string | null };
      organization: { id: string; name: string; slug: string } | null;
    };

const getSessionKey = () => ["session-context"] as const;

async function fetchSession(): Promise<Session> {
  const res = await client.protected["session-context"].$get();
  if (!res.ok) {
    throw new Error(\`session-context \${res.status}\`);
  }
  return (await res.json()) as Session;
}

export function useSession() {
  return useQuery({
    queryKey: getSessionKey(),
    queryFn: fetchSession,
  });
}

export function loadSession(): Promise<Session> {
  return queryClient.ensureQueryData({
    queryKey: getSessionKey(),
    queryFn: fetchSession,
  });
}

export function invalidateSession(): Promise<Session> {
  return queryClient.fetchQuery({
    queryKey: getSessionKey(),
    queryFn: fetchSession,
    staleTime: 0,
  });
}
`.trim();

const SHALLOW_PRODUCTS_HOOK = `
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { z } from "zod";
import { productCreateSchema } from "../../contract/products";
import { client } from "../lib/client";

const getProductsKey = () => ["products"] as const;

export function useProducts() {
  return useQuery({
    queryKey: getProductsKey(),
    queryFn: async () => {
      const res = await client.protected.products.$get();
      if (!res.ok) {
        throw new Error(\`products \${res.status}\`);
      }
      const body = (await res.json()) as { data: unknown[] };
      return body.data;
    },
  });
}

type CreateProductInput = z.infer<typeof productCreateSchema>;

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateProductInput) => {
      const res = await client.protected.products.$post({ json: input });
      if (!res.ok) {
        throw new Error(
          res.status === 409
            ? "That SKU is already in the catalog."
            : \`create product \${res.status}\`
        );
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getProductsKey() });
    },
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await client.protected.products[":id"].$delete({
        param: { id },
      });
      if (!res.ok) {
        throw new Error(\`delete product \${res.status}\`);
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getProductsKey() });
    },
  });
}
`.trim();

const SHALLOW_DOCUMENTS_HOOK = `
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { z } from "zod";
import { documentCreateSchema, lineCreateSchema } from "../../contract/documents";
import { client } from "../lib/client";

const getDocumentsKey = () => ["documents"] as const;
const getDocumentKey = (id: string) => ["documents", id] as const;

export function documentReference(row: { number: number | null }): string {
  return row.number === null
    ? "Draft"
    : \`#\${String(row.number).padStart(4, "0")}\`;
}

export function useDocuments() {
  return useQuery({
    queryKey: getDocumentsKey(),
    queryFn: async () => {
      const res = await client.protected.documents.$get();
      if (!res.ok) {
        throw new Error(\`documents \${res.status}\`);
      }
      const body = (await res.json()) as { data: unknown[] };
      return body.data;
    },
  });
}

export function useDocument(id: string) {
  return useQuery({
    queryKey: getDocumentKey(id),
    queryFn: async () => {
      const res = await client.protected.documents[":id"].$get({
        param: { id },
      });
      if (!res.ok) {
        throw new Error(\`document \${res.status}\`);
      }
      return await res.json();
    },
    enabled: !!id,
  });
}

export function useCreateDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (entityId: z.infer<typeof documentCreateSchema>["entityId"]) => {
      const res = await client.protected.documents.$post({
        json: { entityId },
      });
      if (!res.ok) {
        throw new Error(\`create document \${res.status}\`);
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getDocumentsKey() });
    },
  });
}

type AddLineInput = z.infer<typeof lineCreateSchema> & { id: string };

export function useAddDocumentLine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AddLineInput) => {
      const { id, ...json } = input;
      const res = await client.protected.documents[":id"].lines.$post({
        param: { id },
        json,
      });
      if (!res.ok) {
        throw new Error(\`add line \${res.status}\`);
      }
      return await res.json();
    },
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: getDocumentKey(input.id) });
    },
  });
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await client.protected.documents[":id"].$delete({
        param: { id },
      });
      if (!res.ok) {
        throw new Error(\`delete document \${res.status}\`);
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getDocumentsKey() });
    },
  });
}

export function useDeleteDocumentLine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; lineId: string }) => {
      const res = await client.protected.documents[":id"].lines[":lineId"].$delete({
        param: input,
      });
      if (!res.ok) {
        throw new Error(\`delete line \${res.status}\`);
      }
      return await res.json();
    },
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: getDocumentKey(input.id) });
    },
  });
}

export function useFinalizeDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await client.protected.documents[":id"].finalize.$post({
        param: { id },
      });
      if (!res.ok) {
        throw new Error(\`finalize \${res.status}\`);
      }
      return await res.json();
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: getDocumentKey(id) });
      queryClient.invalidateQueries({ queryKey: getDocumentsKey() });
    },
  });
}
`.trim();

export function applyShallow(
  src: Record<string, string>
): Record<string, string> {
  return {
    ...src,
    [CLIENT]: SHALLOW_CLIENT,
    [HOOK_ENTITIES]: SHALLOW_ENTITIES_HOOK,
    "/app/src/ui/hooks/use-session.ts": SHALLOW_SESSION_HOOK,
    "/app/src/ui/hooks/use-products.ts": SHALLOW_PRODUCTS_HOOK,
    "/app/src/ui/hooks/use-documents.ts": SHALLOW_DOCUMENTS_HOOK,
  };
}
