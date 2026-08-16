/**
 * Check-unit Hono overlays. Not a types-pack (PR 5 is drizzle only).
 *
 * Server unit uses the non-accumulating surface so the program stays on the
 * measured ~93 MB floor. Emit uses the accumulating surface so ApiType
 * prints to a standalone snapshot. Client uses the real VFS (hono/client).
 */
import { TYPES_VFS } from "@sfab-lite/kernel";

const HONO_PREFIX = "/node_modules/hono";

const VFS_KEYS = Object.keys(TYPES_VFS);

export const HONO_TYPED = `
export type EnvBase = {
  Bindings?: object;
  Variables?: Record<string, unknown>;
};

export type Validator<T> = { readonly __valid: T };

export type Context<E extends EnvBase = EnvBase, V = unknown> = {
  env: NonNullable<E["Bindings"]>;
  set<K extends keyof NonNullable<E["Variables"]>>(
    key: K,
    value: NonNullable<E["Variables"]>[K]
  ): void;
  get<K extends keyof NonNullable<E["Variables"]>>(
    key: K
  ): NonNullable<E["Variables"]>[K];
  json(body: unknown, status?: number): Response;
  notFound(): Response;
  req: {
    param(name: string): string;
    header(name: string): string | undefined;
    valid(target: "json"): V;
    raw: Request;
  };
};

export type Handler<E extends EnvBase = EnvBase, V = unknown> = (
  c: Context<E, V>,
  next?: () => Promise<void>
) => unknown | Promise<unknown>;

export type ErrorHandler<E extends EnvBase = EnvBase> = (
  err: Error,
  c: Context<E>
) => Response | Promise<Response>;

export declare class Hono<E extends EnvBase = EnvBase> {
  get(path: string, handler: Handler<E>): this;
  post<T>(
    path: string,
    mw: Handler<E>,
    v: Validator<T>,
    handler: Handler<E, T>
  ): this;
  post<T>(path: string, v: Validator<T>, handler: Handler<E, T>): this;
  post(path: string, handler: Handler<E>): this;
  patch<T>(path: string, v: Validator<T>, handler: Handler<E, T>): this;
  patch(path: string, handler: Handler<E>): this;
  delete(path: string, handler: Handler<E>): this;
  all(path: string, handler: Handler<E>): this;
  use(path: string, handler: Handler<E>): this;
  route(path: string, app: Hono<E>): this;
  onError(handler: ErrorHandler<E>): this;
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

export const HONO_ACCUMULATING = `
export type EnvBase = {
  Bindings?: object;
  Variables?: Record<string, unknown>;
};

export type Validator<T> = { readonly __valid: T };

export type JsonResult<T, S extends number = 200> = Response & {
  readonly __body: T;
  readonly __status: S;
};

export type Context<E extends EnvBase = EnvBase, V = unknown> = {
  env: NonNullable<E["Bindings"]>;
  set<K extends keyof NonNullable<E["Variables"]>>(
    key: K,
    value: NonNullable<E["Variables"]>[K]
  ): void;
  get<K extends keyof NonNullable<E["Variables"]>>(
    key: K
  ): NonNullable<E["Variables"]>[K];
  json<T>(body: T): JsonResult<T, 200>;
  json<T, S extends number>(body: T, status: S): JsonResult<T, S>;
  notFound(): Response;
  req: {
    param(name: string): string;
    header(name: string): string | undefined;
    valid(target: "json"): V;
    raw: Request;
  };
};

type ParamName<P extends string> = P extends \`\${string}:\${infer Rest}\`
  ? Rest extends \`\${infer Name}/\${infer Tail}\`
    ? Name | ParamName<\`/\${Tail}\`>
    : Rest extends \`\${infer Name}*\`
      ? Name
      : Rest
  : never;

type ParamInput<P extends string> = [ParamName<P>] extends [never]
  ? {}
  : { param: { [K in ParamName<P>]: string } };

type NoJson = { readonly __noJson: true };

type RouteInput<P extends string, V = NoJson> = ParamInput<P> &
  (V extends NoJson ? {} : { json: V });

type RouteOutput<R> = Awaited<R> extends {
  readonly __body: infer B;
  readonly __status: infer St extends number;
}
  ? { output: B; outputFormat: "json"; status: St }
  : { output: unknown; outputFormat: "json"; status: number };

type RouteEntry<P extends string, V, R> = {
  input: RouteInput<P, V>;
} & RouteOutput<R>;

type AddRoute<
  S,
  P extends string,
  M extends string,
  Entry,
> = {
  [K in keyof S | P]: K extends P
    ? (P extends keyof S ? S[P] : {}) & { [Key in M]: Entry }
    : K extends keyof S
      ? S[K]
      : never;
};

type JoinPath<A extends string, B extends string> = A extends "/"
  ? B
  : B extends "/"
    ? A
    : \`\${A}\${B}\`;

type Prefixed<Prefix extends string, S> = {
  [K in keyof S as K extends string ? JoinPath<Prefix, K> : never]: S[K];
};

type MergeSchema<A, B> = {
  [K in keyof A | keyof B]: K extends keyof B
    ? K extends keyof A
      ? A[K] & B[K]
      : B[K]
    : K extends keyof A
      ? A[K]
      : never;
};

export type ErrorHandler<E extends EnvBase = EnvBase> = (
  err: Error,
  c: Context<E>
) => Response | Promise<Response>;

export type Handler<E extends EnvBase = EnvBase, V = unknown> = (
  c: Context<E, V>,
  next?: () => Promise<void>
) => unknown | Promise<unknown>;

export declare class Hono<E extends EnvBase = EnvBase, S = {}> {
  readonly _schema: S;

  get<P extends string, R>(
    path: P,
    handler: (c: Context<E>) => R
  ): Hono<E, AddRoute<S, P, "$get", RouteEntry<P, NoJson, R>>>;

  post<P extends string, T, R>(
    path: P,
    mw: (c: Context<E>, next: () => Promise<void>) => unknown,
    v: Validator<T>,
    handler: (c: Context<E, T>) => R
  ): Hono<E, AddRoute<S, P, "$post", RouteEntry<P, T, R>>>;
  post<P extends string, T, R>(
    path: P,
    v: Validator<T>,
    handler: (c: Context<E, T>) => R
  ): Hono<E, AddRoute<S, P, "$post", RouteEntry<P, T, R>>>;
  post<P extends string, R>(
    path: P,
    handler: (c: Context<E>) => R
  ): Hono<E, AddRoute<S, P, "$post", RouteEntry<P, NoJson, R>>>;

  patch<P extends string, T, R>(
    path: P,
    v: Validator<T>,
    handler: (c: Context<E, T>) => R
  ): Hono<E, AddRoute<S, P, "$patch", RouteEntry<P, T, R>>>;
  patch<P extends string, R>(
    path: P,
    handler: (c: Context<E>) => R
  ): Hono<E, AddRoute<S, P, "$patch", RouteEntry<P, NoJson, R>>>;

  delete<P extends string, R>(
    path: P,
    handler: (c: Context<E>) => R
  ): Hono<E, AddRoute<S, P, "$delete", RouteEntry<P, NoJson, R>>>;

  all<P extends string, R>(
    path: P,
    handler: (c: Context<E>) => R
  ): Hono<E, AddRoute<S, P, "$all", RouteEntry<P, NoJson, R>>>;

  use(
    path: string,
    handler: (c: Context<E>, next: () => Promise<void>) => unknown
  ): Hono<E, S>;
  route<P extends string, S2>(path: P, app: Hono<EnvBase, S2>): Hono<
    E,
    MergeSchema<S, Prefixed<P, S2>>
  >;
  onError(handler: ErrorHandler<E>): Hono<E, S>;
  basePath(path: string): Hono<E, S>;
  on(
    event: string,
    handler: (c: Context<E>) => unknown
  ): Hono<E, S>;
}

export type ExtractSchema<T> = T extends Hono<any, infer S> ? S : never;

export declare function validator<T>(
  target: "json",
  fn: (value: unknown, c: Context) => T | Response
): Validator<Exclude<T, Response>>;

export declare function createMiddleware<E extends EnvBase>(
  fn: (c: Context<E>, next: () => Promise<void>) => unknown
): (c: Context<E>, next: () => Promise<void>) => unknown;
`.trim();

function matchesHonoPath(key: string): boolean {
  return key === HONO_PREFIX || key.startsWith(`${HONO_PREFIX}/`);
}

export function applyHonoOverlay(
  overlay: Map<string, string>,
  versions: Map<string, number>,
  text: string | null
): void {
  for (const key of VFS_KEYS) {
    if (!matchesHonoPath(key)) {
      continue;
    }
    if (key.endsWith("package.json")) {
      continue;
    }
    if (text == null) {
      overlay.delete(key);
    } else {
      overlay.set(key, text);
    }
    versions.set(key, (versions.get(key) ?? 0) + 1);
  }
}
