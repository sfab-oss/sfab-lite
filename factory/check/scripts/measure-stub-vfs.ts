/**
 * Can we compile the expensive libraries away on the 135 MB server-entities
 * program by overlaying tiny .d.ts stubs on the types VFS?
 *
 *   node scripts/run-measure.mjs measure-stub-vfs.ts
 *
 * Overlay wins in readVfs, so stubbing `/node_modules/<pkg>/…` replaces the
 * frozen TYPES_VFS entries for that package. Local heap is an indicator.
 */

import { TYPES_VFS } from "@sfab-lite/kernel";
import seed from "@sfab-lite/template/seed" with { type: "json" };
import {
  clientPrefixesFromManifest,
  createAppLsState,
  getLanguageService,
} from "@sfab-lite/verbs/check";
import { SEED_MANIFEST } from "./seed-manifest.ts";

const SERVER_ENTITIES = "/app/src/hono/org-protected/entities.ts";

const AMBIENT_ROOTS: string[] = [
  "/types/cloudflare-ambient.d.ts",
  ...Object.keys(TYPES_VFS)
    .filter((k) => k.startsWith("/libs/lib.") && k.endsWith(".d.ts"))
    .sort(),
];

const STUB = `
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
export declare const organizationClient: any;
export declare const createAuthClient: any;
export declare const Hono: any;
export type InferRequestType<T = any> = any;
export type InferResponseType<T = any, S = any> = any;
export type ErrorHandler = any;
export type ZodType = any;
export type z = any;
declare const _default: any;
export default _default;
`.trim();

const files: Record<string, string> = {};
for (const [path, text] of Object.entries(
  seed.sourceFiles as Record<string, string>
)) {
  if (path.endsWith(".ts") || path.endsWith(".tsx")) {
    files[`/app/${path}`] = text;
  }
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

function overlayStubs(
  overlay: Map<string, string>,
  versions: Map<string, number>,
  prefixes: string[]
): number {
  let n = 0;
  for (const key of Object.keys(TYPES_VFS)) {
    if (prefixes.some((p) => matchesPrefix(key, p))) {
      overlay.set(key, STUB);
      versions.set(key, 1);
      n += 1;
    }
  }
  return n;
}

function overlayOf(prefixes: string[]) {
  const st = createAppLsState(clientPrefixesFromManifest(SEED_MANIFEST));
  for (const [p, text] of Object.entries(files)) {
    st.overlay.set(p, text);
    st.versions.set(p, 1);
  }
  const stubbedFiles = overlayStubs(st.overlay, st.versions, prefixes);
  return { st, stubbedFiles };
}

function measure(label: string, prefixes: string[]) {
  const before = heapMb();
  const { st, stubbedFiles } = overlayOf(prefixes);
  st.rootFiles = [SERVER_ENTITIES, ...AMBIENT_ROOTS];
  const ls = getLanguageService(st);

  const t0 = Date.now();
  const diagnostics = ls.getSemanticDiagnostics(SERVER_ENTITIES).length;
  const ms = Date.now() - t0;

  const p = ls.getProgram();
  const sfs = p ? p.getSourceFiles() : [];
  const bytes = sfs.reduce((n, s) => n + s.text.length, 0);
  const after = heapMb();
  const row = {
    label,
    stubPrefixes: prefixes,
    stubbedFiles,
    loadedFiles: sfs.length,
    loadedTextMb: Number((bytes / 1_048_576).toFixed(2)),
    diagnostics,
    ms,
    heapRetainedMb: Number((after - before).toFixed(0)),
  };
  console.log(JSON.stringify(row));
  return row;
}

const DRIZZLE = ["/node_modules/drizzle-orm"];
const HONO = ["/node_modules/hono"];
const ZOD = ["/node_modules/zod"];
const AUTH = [
  "/node_modules/better-auth",
  "/node_modules/@better-auth",
  "/node_modules/better-call",
];
const AUTH_TRANSITIVE = ["/node_modules/kysely", "/node_modules/jose"];
const ALL_NODE_MODULES = ["/node_modules"];

measure("server entities, real VFS", []);
measure("stub drizzle-orm", DRIZZLE);
measure("stub drizzle + hono", [...DRIZZLE, ...HONO]);
measure("stub drizzle + hono + zod", [...DRIZZLE, ...HONO, ...ZOD]);
measure("stub drizzle + hono + zod + better-auth family", [
  ...DRIZZLE,
  ...HONO,
  ...ZOD,
  ...AUTH,
]);
measure("stub + auth transitives (kysely, jose)", [
  ...DRIZZLE,
  ...HONO,
  ...ZOD,
  ...AUTH,
  ...AUTH_TRANSITIVE,
]);
measure("stub all /node_modules", ALL_NODE_MODULES);
