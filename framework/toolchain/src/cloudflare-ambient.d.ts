/**
 * The Cloudflare surface an sfab-lite app is allowed to see — the single
 * source of truth for it.
 *
 * Sub-app code does not run under `@cloudflare/workers-types`. It runs in a
 * LOADER child isolate and is typechecked by the factory's check worker
 * against a small ambient surface baked into the kernel's types VFS. This
 * file IS that surface. Two consumers, one definition:
 *
 *   - `starters/erp/tsconfig.app.json` includes it, so the template
 *     typechecks locally against exactly what the factory resolves.
 *   - `framework/runtime`'s prebuild bakes it into the types VFS as
 *     `/types/cloudflare-ambient.d.ts`.
 *
 * Anything added here becomes visible to every app, so add deliberately:
 * a binding an app can reference but the runtime does not provide is a
 * green typecheck and a runtime failure. Anything NOT here is unresolved
 * in the factory even if `@cloudflare/workers-types` declares it.
 */

// biome-ignore-all lint/style/useConsistentMethodSignatures: this file mirrors Cloudflare's own declarations so it stays diffable against them; nothing here is implemented by us, so method bivariance is not a hazard.

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  run<T = Record<string, unknown>>(): Promise<{
    success: boolean;
    meta: unknown;
    results?: T[];
  }>;
  all<T = Record<string, unknown>>(): Promise<{
    results: T[];
    success: boolean;
    meta: unknown;
  }>;
  raw<T = unknown[]>(options?: { columnNames?: boolean }): Promise<T[]>;
}

/** D1 is the Cloudflare adapter's engine. Apps write `drizzle-orm/d1` against this. */
interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<T[]>;
  exec(query: string): Promise<unknown>;
}

interface Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
  readonly props: unknown;
  readonly exports?: unknown;
}
