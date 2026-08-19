/**
 * Can per-slice checking fit the 128 MB isolate cap?
 *
 * Four programs over today's template, matching the lite-evolution direction
 * note (item 8): data-only, shared-only, server with the client edge cut, and
 * client checking against a generated API `.d.ts` (severs `hc<ApiType>`).
 *
 * Same harness shape as `measure-split.ts`: overlay holds every app file so
 * imports still resolve; only `roots` seed the program. Union is the baseline
 * (what the check worker does today). Local heap is a relative indicator —
 * never a production claim.
 *
 *   node scripts/measure-zones.mjs
 */

import { TYPES_VFS } from "@sfab-lite/kernel";
import seed from "@sfab-lite/starter-erp/seed" with { type: "json" };
import {
  clientPrefixesFromManifest,
  createAppLsState,
  getLanguageService,
} from "@sfab-lite/verbs/check";
import ts from "typescript";
import { SEED_MANIFEST } from "./seed-manifest.ts";

const CLIENT_ENTRY = "/app/src/ui/main.tsx";
const SERVER_ENTRY = "/app/src/hono/index.ts";
const CLIENT = "/app/src/ui/lib/client.ts";
const API_DTS = "/app/src/ui/lib/api.d.ts";
const DRIZZLE_RE = /drizzle/i;
const HONO_INDEX_RE = /hono\/index/;

const AMBIENT_ROOTS: string[] = [
  "/types/cloudflare-ambient.d.ts",
  ...Object.keys(TYPES_VFS)
    .filter((k) => k.startsWith("/libs/lib.") && k.endsWith(".d.ts"))
    .sort(),
];

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

function overlayOf(src: Record<string, string>) {
  const st = createAppLsState(clientPrefixesFromManifest(SEED_MANIFEST));
  for (const [p, text] of Object.entries(src)) {
    st.overlay.set(p, text);
    st.versions.set(p, 1);
  }
  return st;
}

function measure(
  label: string,
  roots: string[],
  src: Record<string, string> = files
) {
  const before = heapMb();
  const st = overlayOf(src);
  st.rootFiles = [...roots, ...AMBIENT_ROOTS];
  const ls = getLanguageService(st);

  const t0 = Date.now();
  let diagnostics = 0;
  for (const r of roots) {
    diagnostics += ls.getSemanticDiagnostics(r).length;
  }
  const ms = Date.now() - t0;

  const p = ls.getProgram();
  const sfs = p ? p.getSourceFiles() : [];
  const bytes = sfs.reduce((n, s) => n + s.text.length, 0);
  const after = heapMb();
  const row = {
    label,
    roots: roots.length,
    loadedFiles: sfs.length,
    loadedTextMb: Number((bytes / 1_048_576).toFixed(2)),
    diagnostics,
    ms,
    heapRetainedMb: Number((after - before).toFixed(0)),
  };
  console.log(JSON.stringify(row));
  return row;
}

function pathsUnder(prefix: string): string[] {
  return Object.keys(files)
    .filter(
      (p) => p.startsWith(prefix) && (p.endsWith(".ts") || p.endsWith(".tsx"))
    )
    .sort();
}

function generateApiDts(src: Record<string, string>): {
  text: string;
  mentionsDrizzle: boolean;
  mentionsHonoIndex: boolean;
} {
  const st = overlayOf(src);
  st.rootFiles = [SERVER_ENTRY, ...AMBIENT_ROOTS];
  const ls = getLanguageService(st);
  const prog = ls.getProgram();
  if (!prog) {
    throw new Error("generateApiDts: no program");
  }
  const sf = prog.getSourceFile(SERVER_ENTRY);
  if (!sf) {
    throw new Error("generateApiDts: missing server entry");
  }
  const checker = prog.getTypeChecker();
  let typeString: string | undefined;
  const visit = (node: ts.Node) => {
    if (
      ts.isTypeAliasDeclaration(node) &&
      node.name.text === "ApiType" &&
      node.type
    ) {
      const type = checker.getTypeFromTypeNode(node.type);
      typeString = checker.typeToString(
        type,
        node,
        ts.TypeFormatFlags.NoTruncation
      );
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (!typeString) {
    throw new Error("generateApiDts: ApiType alias not found");
  }
  const text = `export type ApiType = ${typeString};\n`;
  return {
    text,
    mentionsDrizzle: DRIZZLE_RE.test(text),
    mentionsHonoIndex: HONO_INDEX_RE.test(text),
  };
}

const union = measure("union (today)", Object.keys(files).sort());
const data = measure("data-only", pathsUnder("/app/src/db/"));
const shared = measure("shared-only", pathsUnder("/app/src/contract/"));
const server = measure("server, client edge cut", [SERVER_ENTRY]);

const dts = generateApiDts(files);
console.log(
  JSON.stringify({
    label: "generated api.d.ts",
    bytes: dts.text.length,
    mentionsDrizzle: dts.mentionsDrizzle,
    mentionsHonoIndex: dts.mentionsHonoIndex,
    preview: dts.text.slice(0, 240),
  })
);

const clientFiles = { ...files };
clientFiles[API_DTS] = dts.text;
clientFiles[CLIENT] = `import { hc } from "hono/client";
import type { ApiType } from "./api";
import { publicBase } from "./public-base";

export const client = hc<ApiType>(publicBase ? \`\${publicBase}/api\` : "/api");
`;
const client = measure(
  "client vs generated API .d.ts",
  [CLIENT_ENTRY],
  clientFiles
);

const peak = Math.max(
  data.heapRetainedMb,
  shared.heapRetainedMb,
  server.heapRetainedMb,
  client.heapRetainedMb
);
console.log(
  JSON.stringify({
    label: "summary",
    unionHeapMb: union.heapRetainedMb,
    peakSliceHeapMb: peak,
    isolateCapMb: 128,
    slicesVsUnion: Number((peak / union.heapRetainedMb).toFixed(2)),
  })
);
