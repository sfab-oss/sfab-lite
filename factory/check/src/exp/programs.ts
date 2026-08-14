/**
 * Throwaway check programs for the prod-tail matrix.
 * Not imported by the product worker (`src/index.ts`).
 */
import { TYPES_VFS } from "@sfab-lite/kernel";
import seed from "@sfab-lite/template/seed" with { type: "json" };
import {
  applyShallow,
  CLIENT,
  HONO_ACCUMULATING,
  HONO_TYPED,
  overlayTypedVendors,
} from "../../scripts/experiment-overlays.ts";
import { createAppLsState, getLanguageService } from "../ls-host.ts";
import { forEachChild, isTypeAliasDeclaration } from "../typescript-runtime.ts";

const SERVER_ENTRY = "/app/src/hono/index.ts";
const CLIENT_ENTRY = "/app/src/ui/main.tsx";
const API_DTS = "/app/src/ui/lib/api.d.ts";

const AMBIENT_ROOTS: string[] = [
  "/types/cloudflare-ambient.d.ts",
  ...Object.keys(TYPES_VFS)
    .filter((k) => k.startsWith("/libs/lib.") && k.endsWith(".d.ts"))
    .sort(),
];

const VFS_KEYS = Object.keys(TYPES_VFS);

const seedFiles: Record<string, string> = {};
for (const [path, text] of Object.entries(
  seed.sourceFiles as Record<string, string>
)) {
  if (path.endsWith(".ts") || path.endsWith(".tsx")) {
    seedFiles[`/app/${path}`] = text;
  }
}

const unionRoots = Object.keys(seedFiles)
  .filter(
    (p) =>
      p.startsWith("/app/src/") && (p.endsWith(".ts") || p.endsWith(".tsx"))
  )
  .sort();

export const PROGRAMS = [
  "union",
  "cheap-union",
  "server-unit",
  "accumulating-emit",
  "client-snapshot",
] as const;

export type ProgramName = (typeof PROGRAMS)[number];

export function isProgramName(s: string): s is ProgramName {
  return (PROGRAMS as readonly string[]).includes(s);
}

function checkRoots(
  st: ReturnType<typeof createAppLsState>,
  roots: string[]
): { diagnostics: number; ms: number; loadedFiles: number } {
  st.rootFiles = [...roots, ...AMBIENT_ROOTS];
  const t0 = Date.now();
  const ls = getLanguageService(st);
  let diagnostics = 0;
  for (const r of roots) {
    diagnostics += ls.getSemanticDiagnostics(r).length;
  }
  const prog = ls.getProgram();
  return {
    diagnostics,
    ms: Date.now() - t0,
    loadedFiles: prog ? prog.getSourceFiles().length : 0,
  };
}

function overlayApp(src: Record<string, string>, honoText: string | undefined) {
  const st = createAppLsState();
  for (const [p, text] of Object.entries(src)) {
    st.overlay.set(p, text);
    st.versions.set(p, 1);
  }
  const stubbedFiles = honoText
    ? overlayTypedVendors(st.overlay, st.versions, honoText, VFS_KEYS)
    : 0;
  return { st, stubbedFiles };
}

function snapshotClient(
  src: Record<string, string>,
  apiText: string
): Record<string, string> {
  return {
    ...src,
    [API_DTS]: apiText,
    [CLIENT]: `import { hc } from "hono/client";
import type { ApiType } from "./api";
import { publicBase } from "./public-base";

type AsHono = import("hono").Hono<any, ApiType>;
export const client = hc<AsHono>(publicBase ? \`\${publicBase}/api\` : "/api");
`,
  };
}

function emitApiDts(
  st: ReturnType<typeof createAppLsState>,
  entry: string
): string {
  const ls = getLanguageService(st);
  const prog = ls.getProgram();
  const sf = prog?.getSourceFile(entry);
  if (!(prog && sf)) {
    return "";
  }
  const checker = prog.getTypeChecker();
  let typeNode: import("typescript").TypeNode | undefined;
  const visit = (node: import("typescript").Node) => {
    if (
      isTypeAliasDeclaration(node) &&
      node.name.text === "ApiType" &&
      node.type
    ) {
      typeNode = node.type;
      return;
    }
    forEachChild(node, visit);
  };
  visit(sf);
  if (!typeNode) {
    return "";
  }
  const apiType = checker.getTypeFromTypeNode(typeNode);
  const schema = checker.getTypeOfPropertyOfType(apiType, "_schema") ?? apiType;
  return `export type ApiType = ${checker.typeToString(schema)};\n`;
}

function runNamed(name: ProgramName, bakedDts: string) {
  if (name === "union") {
    const { st, stubbedFiles } = overlayApp(seedFiles, undefined);
    return { program: name, stubbedFiles, ...checkRoots(st, unionRoots) };
  }
  if (name === "cheap-union") {
    const { st, stubbedFiles } = overlayApp(
      applyShallow(seedFiles),
      HONO_TYPED
    );
    return { program: name, stubbedFiles, ...checkRoots(st, unionRoots) };
  }
  if (name === "server-unit") {
    const { st, stubbedFiles } = overlayApp(seedFiles, HONO_TYPED);
    return { program: name, stubbedFiles, ...checkRoots(st, [SERVER_ENTRY]) };
  }
  if (name === "accumulating-emit") {
    const { st, stubbedFiles } = overlayApp(seedFiles, HONO_ACCUMULATING);
    const row = checkRoots(st, [SERVER_ENTRY]);
    const dts = emitApiDts(st, SERVER_ENTRY);
    return { program: name, stubbedFiles, apiDtsBytes: dts.length, ...row };
  }
  const { st, stubbedFiles } = overlayApp(
    snapshotClient(seedFiles, bakedDts),
    undefined
  );
  return {
    program: name,
    stubbedFiles,
    apiDtsBytes: bakedDts.length,
    ...checkRoots(st, [CLIENT_ENTRY]),
  };
}

/** Synchronous: same isolate invariant as `runCheck`. */
export function runProgram(
  name: ProgramName,
  bakedDts: string
): Record<string, unknown> {
  return runNamed(name, bakedDts);
}
