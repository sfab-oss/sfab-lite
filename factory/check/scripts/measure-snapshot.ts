/**
 * Can a cheap route-accumulating Hono emit a standalone api.d.ts as a
 * byproduct of the server-entry check?
 *
 *   node scripts/run-measure.mjs measure-snapshot.ts
 *
 * Overlays typed drizzle + accumulating Hono on `/app/src/hono/index.ts`
 * import closure. Local heap is an indicator, never a production claim.
 */

import { writeFileSync } from "node:fs";
import { TYPES_VFS } from "@sfab-lite/kernel";
import seed from "@sfab-lite/template/seed" with { type: "json" };
import ts from "typescript";
import { createAppLsState, getLanguageService } from "../src/ls-host.ts";
import {
  CLIENT,
  HONO_ACCUMULATING,
  HONO_TYPED,
  HOOK_ENTITIES,
  overlayTypedVendors,
} from "./experiment-overlays.ts";

const SERVER_ENTRY = "/app/src/hono/index.ts";
const SERVER_ENTITIES = "/app/src/hono/org-protected/entities.ts";
const CLIENT_ENTRY = "/app/src/ui/main.tsx";
const API_DTS = "/app/src/ui/lib/api.d.ts";
const DRIZZLE_RE = /drizzle/i;
const HONO_INDEX_RE = /hono\/index/;
const UNRESOLVED_RE =
  /\b(AppEnv|Auth|Db|ExtractSchema|HonoBase|MergeSchemaPath)\b/;

const AMBIENT_ROOTS: string[] = [
  "/types/cloudflare-ambient.d.ts",
  ...Object.keys(TYPES_VFS)
    .filter((k) => k.startsWith("/libs/lib.") && k.endsWith(".d.ts"))
    .sort(),
];

const VFS_KEYS = Object.keys(TYPES_VFS);

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

const staleGet = healthyEntities.replace(
  "data: rows,",
  "items: rows as typeof rows,"
);
if (staleGet === healthyEntities) {
  throw new Error("freshness overlay did not change entities GET");
}

function heapMb(): number {
  global.gc?.();
  global.gc?.();
  global.gc?.();
  return process.memoryUsage().heapUsed / 1_048_576;
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

function unwrap(checker: ts.TypeChecker, type: ts.Type): ts.Type {
  let current = type;
  for (let i = 0; i < 6; i += 1) {
    const symbolName =
      current.aliasSymbol?.getName() ?? current.getSymbol()?.getName();
    if (symbolName === "Promise") {
      const args =
        current.aliasTypeArguments ??
        (current as ts.TypeReference).typeArguments;
      if (args?.[0]) {
        current = args[0];
        continue;
      }
    }
    const body = checker.getTypeOfPropertyOfType(current, "__body");
    if (body) {
      current = body;
      continue;
    }
    break;
  }
  return current;
}

function hasTypeFlag(type: ts.Type, flag: ts.TypeFlags): boolean {
  // biome-ignore lint/suspicious/noBitwiseOperators: TypeFlags is a bitfield
  return (type.getFlags() & flag) !== 0;
}

function printLiteral(type: ts.Type): string | undefined {
  if (hasTypeFlag(type, ts.TypeFlags.Never)) {
    return "never";
  }
  if (hasTypeFlag(type, ts.TypeFlags.Any)) {
    return "any";
  }
  if (hasTypeFlag(type, ts.TypeFlags.Unknown)) {
    return "unknown";
  }
  if (hasTypeFlag(type, ts.TypeFlags.Void)) {
    return "void";
  }
  if (hasTypeFlag(type, ts.TypeFlags.Null)) {
    return "null";
  }
  if (hasTypeFlag(type, ts.TypeFlags.Undefined)) {
    return "undefined";
  }
  if (hasTypeFlag(type, ts.TypeFlags.String)) {
    return "string";
  }
  if (hasTypeFlag(type, ts.TypeFlags.Number)) {
    return "number";
  }
  if (hasTypeFlag(type, ts.TypeFlags.Boolean)) {
    return "boolean";
  }
  if (hasTypeFlag(type, ts.TypeFlags.StringLiteral)) {
    return JSON.stringify((type as ts.StringLiteralType).value);
  }
  if (hasTypeFlag(type, ts.TypeFlags.NumberLiteral)) {
    return String((type as ts.NumberLiteralType).value);
  }
  if (hasTypeFlag(type, ts.TypeFlags.BooleanLiteral)) {
    return (type as ts.IntrinsicType).intrinsicName === "true"
      ? "true"
      : "false";
  }
}

function printFields(
  checker: ts.TypeChecker,
  props: ts.Symbol[],
  hint: ts.Node,
  depth: number
): string {
  const seen = new Set<string>();
  const fields: string[] = [];
  for (const p of props) {
    if (seen.has(p.name) || p.name.startsWith("__")) {
      continue;
    }
    seen.add(p.name);
    const pt = unwrap(checker, checker.getTypeOfSymbolAtLocation(p, hint));
    fields.push(
      `${JSON.stringify(p.name)}: ${printExpanded(checker, pt, hint, depth + 1)}`
    );
  }
  return `{ ${fields.join("; ")} }`;
}

function printExpanded(
  checker: ts.TypeChecker,
  type: ts.Type,
  hint: ts.Node,
  depth = 0
): string {
  if (depth > 14) {
    return "unknown";
  }
  const literal = printLiteral(type);
  if (literal) {
    return literal;
  }
  if (hasTypeFlag(type, ts.TypeFlags.Union)) {
    return (type as ts.UnionType).types
      .map((t) => printExpanded(checker, t, hint, depth + 1))
      .join(" | ");
  }
  if (hasTypeFlag(type, ts.TypeFlags.Intersection)) {
    const parts = (type as ts.IntersectionType).types.filter(
      (t) =>
        !hasTypeFlag(t, ts.TypeFlags.Object) ||
        checker.getPropertiesOfType(t).length > 0
    );
    const objects = parts.filter(
      (t) => checker.getPropertiesOfType(t).length > 0
    );
    if (objects.length === parts.length && objects.length > 0) {
      return printFields(
        checker,
        objects.flatMap((t) => checker.getPropertiesOfType(t)),
        hint,
        depth
      );
    }
    return parts
      .map((t) => printExpanded(checker, t, hint, depth + 1))
      .join(" & ");
  }

  const unwrapped = unwrap(checker, type);
  if (unwrapped !== type) {
    return printExpanded(checker, unwrapped, hint, depth + 1);
  }

  const typeArgs =
    type.aliasTypeArguments ?? (type as ts.TypeReference).typeArguments;
  const symbolName = type.aliasSymbol?.getName() ?? type.getSymbol()?.getName();
  if (symbolName === "Date") {
    return "Date";
  }
  if (symbolName === "Array" && typeArgs?.[0]) {
    return `Array<${printExpanded(checker, typeArgs[0], hint, depth + 1)}>`;
  }
  if (symbolName === "Column" && typeArgs?.[0]) {
    return printExpanded(checker, typeArgs[0], hint, depth + 1);
  }
  if (symbolName === "RowOf" && typeArgs?.[0]) {
    return printExpanded(checker, typeArgs[0], hint, depth + 1);
  }

  const props = checker
    .getPropertiesOfType(type)
    .filter((p) => !p.name.startsWith("__"));
  if (props.length) {
    return printFields(checker, props, hint, depth);
  }
  if (hasTypeFlag(type, ts.TypeFlags.Object)) {
    return "{}";
  }
  return "unknown";
}

function printSchema(
  checker: ts.TypeChecker,
  schemaType: ts.Type,
  hint: ts.Node
): { text: string; pathCount: number; methodCount: number } {
  const paths = checker.getPropertiesOfType(schemaType);
  let methodCount = 0;
  const entries: string[] = [];
  for (const pathSym of paths) {
    const pathType = checker.getTypeOfSymbolAtLocation(pathSym, hint);
    const methods = checker
      .getPropertiesOfType(pathType)
      .filter(
        (m) =>
          m.name === "$get" ||
          m.name === "$post" ||
          m.name === "$patch" ||
          m.name === "$delete"
      );
    if (methods.length === 0) {
      continue;
    }
    methodCount += methods.length;
    const methodEntries = methods.map((m) => {
      const mt = unwrap(checker, checker.getTypeOfSymbolAtLocation(m, hint));
      const input =
        checker.getTypeOfPropertyOfType(mt, "input") ??
        checker.getTypeOfPropertyOfType(pathType, "input");
      const output = checker.getTypeOfPropertyOfType(mt, "output");
      const status = checker.getTypeOfPropertyOfType(mt, "status");
      const inputText = input
        ? printExpanded(checker, unwrap(checker, input), hint)
        : "{}";
      const outputText = output
        ? printExpanded(checker, unwrap(checker, output), hint)
        : "unknown";
      let statusText = status ? printExpanded(checker, status, hint) : "200";
      if (statusText === "number") {
        statusText = "200";
      }
      return `"${m.name}": { input: ${inputText}; output: ${outputText}; outputFormat: "json"; status: ${statusText} }`;
    });
    entries.push(`"${pathSym.name}": { ${methodEntries.join("; ")} }`);
  }
  return {
    text: `{ ${entries.join("; ")} }`,
    pathCount: entries.length,
    methodCount,
  };
}

function schemaFromApiType(
  checker: ts.TypeChecker,
  apiType: ts.Type,
  hint: ts.Node
): { text: string; pathCount: number; methodCount: number } {
  const schemaProp = checker.getTypeOfPropertyOfType(apiType, "_schema");
  if (schemaProp) {
    return printSchema(checker, schemaProp, hint);
  }
  const args = (apiType as ts.TypeReference).typeArguments;
  if (args && args.length >= 2) {
    return printSchema(checker, args[1], hint);
  }
  return printSchema(checker, apiType, hint);
}

function generateApiDts(
  ls: ts.LanguageService,
  entry = SERVER_ENTRY
): {
  text: string;
  mentionsDrizzle: boolean;
  mentionsHonoIndex: boolean;
  unresolvedNames: boolean;
  pathCount: number;
  methodCount: number;
  preview: string;
} {
  const prog = ls.getProgram();
  if (!prog) {
    throw new Error("generateApiDts: no program");
  }
  const sf = prog.getSourceFile(entry);
  if (!sf) {
    throw new Error(`generateApiDts: missing ${entry}`);
  }
  const checker = prog.getTypeChecker();
  let apiNode: ts.TypeAliasDeclaration | undefined;
  const visit = (node: ts.Node) => {
    if (
      ts.isTypeAliasDeclaration(node) &&
      node.name.text === "ApiType" &&
      node.type
    ) {
      apiNode = node;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (!apiNode?.type) {
    throw new Error("generateApiDts: ApiType alias not found");
  }
  const apiType = checker.getTypeFromTypeNode(apiNode.type);
  const schema = schemaFromApiType(checker, apiType, apiNode);
  const text = `export type ApiType = ${schema.text};\n`;
  return {
    text,
    mentionsDrizzle: DRIZZLE_RE.test(text),
    mentionsHonoIndex: HONO_INDEX_RE.test(text),
    unresolvedNames: UNRESOLVED_RE.test(text),
    pathCount: schema.pathCount,
    methodCount: schema.methodCount,
    preview: text.slice(0, 500),
  };
}

function snapshotClient(apiText: string): Record<string, string> {
  return {
    ...files,
    [API_DTS]: apiText,
    [CLIENT]: `import { hc } from "hono/client";
import type { ApiType } from "./api";
import { publicBase } from "./public-base";

type AsHono = import("hono").Hono<any, ApiType>;
export const client = hc<AsHono>(publicBase ? \`\${publicBase}/api\` : "/api");
`,
  };
}

function freshnessProbe(apiText: string): Record<string, string> {
  return {
    ...files,
    [API_DTS]: apiText,
    "/app/src/ui/lib/snapshot-probe.ts": `import type { ApiType } from "./api";

export function probe(
  body: ApiType["/protected/entities"]["$get"]["output"]
): number {
  return body.data.length;
}
`,
  };
}

type HonoKind = "real" | "typed" | "accumulating";

function honoText(kind: HonoKind): string | undefined {
  if (kind === "typed") {
    return HONO_TYPED;
  }
  if (kind === "accumulating") {
    return HONO_ACCUMULATING;
  }
}

function measure(opts: {
  label: string;
  roots: string[];
  src: Record<string, string>;
  hono: HonoKind;
  emit?: boolean;
  diagRoots?: string[];
}) {
  const before = heapMb();
  const st = createAppLsState();
  for (const [p, text] of Object.entries(opts.src)) {
    st.overlay.set(p, text);
    st.versions.set(p, 1);
  }
  const overlayText = honoText(opts.hono);
  const stubbedFiles = overlayText
    ? overlayTypedVendors(st.overlay, st.versions, overlayText, VFS_KEYS)
    : 0;
  st.rootFiles = [...opts.roots, ...AMBIENT_ROOTS];
  const ls = getLanguageService(st);

  const t0 = Date.now();
  const allDiags: ts.Diagnostic[] = [];
  for (const r of opts.diagRoots ?? opts.roots) {
    allDiags.push(...ls.getSemanticDiagnostics(r));
  }
  const dts = opts.emit
    ? generateApiDts(ls, opts.roots[0] ?? SERVER_ENTRY)
    : undefined;
  const ms = Date.now() - t0;

  const p = ls.getProgram();
  const sfs = p ? p.getSourceFiles() : [];
  const bytes = sfs.reduce((n, s) => n + s.text.length, 0);
  const after = heapMb();
  const row: Record<string, unknown> = {
    label: opts.label,
    roots: opts.roots.length,
    stubbedFiles,
    loadedFiles: sfs.length,
    loadedTextMb: Number((bytes / 1_048_576).toFixed(2)),
    diagnostics: allDiags.length,
    diagnosticSample: diagSummary(allDiags),
    ms,
    heapRetainedMb: Number((after - before).toFixed(0)),
  };
  if (dts) {
    row.apiDtsBytes = dts.text.length;
    row.mentionsDrizzle = dts.mentionsDrizzle;
    row.mentionsHonoIndex = dts.mentionsHonoIndex;
    row.unresolvedNames = dts.unresolvedNames;
    row.pathCount = dts.pathCount;
    row.methodCount = dts.methodCount;
    row.preview = dts.preview;
  }
  console.log(JSON.stringify(row));
  return { row, dts };
}

measure({
  label: "server, real VFS",
  roots: [SERVER_ENTRY],
  src: files,
  hono: "real",
});
measure({
  label: "server, typed drizzle+hono (no accum)",
  roots: [SERVER_ENTRY],
  src: files,
  hono: "typed",
});

const accum = measure({
  label: "server, typed drizzle+accumulating hono",
  roots: [SERVER_ENTRY],
  src: files,
  hono: "accumulating",
  emit: true,
});

if (!accum.dts) {
  throw new Error("accumulating pass did not emit api.d.ts");
}

if (process.env.WRITE_DTS) {
  writeFileSync(
    process.env.WRITE_DTS,
    `export const BAKED_API_DTS =\n  ${JSON.stringify(accum.dts.text)};\n`
  );
}

console.log(
  JSON.stringify({
    label: "generated api.d.ts",
    bytes: accum.dts.text.length,
    pathCount: accum.dts.pathCount,
    methodCount: accum.dts.methodCount,
    mentionsDrizzle: accum.dts.mentionsDrizzle,
    mentionsHonoIndex: accum.dts.mentionsHonoIndex,
    unresolvedNames: accum.dts.unresolvedNames,
    preview: accum.dts.preview,
  })
);

const clientFiles = snapshotClient(accum.dts.text);
measure({
  label: "client vs snapshot",
  roots: [CLIENT_ENTRY],
  src: clientFiles,
  hono: "real",
  diagRoots: [CLIENT_ENTRY, CLIENT, HOOK_ENTITIES, API_DTS],
});

measure({
  label: "snapshot standalone (api.d.ts only)",
  roots: [API_DTS],
  src: { [API_DTS]: accum.dts.text },
  hono: "real",
});

measure({
  label: "broken entities, accumulating",
  roots: [SERVER_ENTRY],
  src: { ...files, [SERVER_ENTITIES]: brokenEntities },
  hono: "accumulating",
  diagRoots: [SERVER_ENTITIES],
});

const stale = measure({
  label: "stale GET shape, accumulating emit",
  roots: [SERVER_ENTRY],
  src: { ...files, [SERVER_ENTITIES]: staleGet },
  hono: "accumulating",
  emit: true,
});

if (!stale.dts) {
  throw new Error("stale pass did not emit api.d.ts");
}

measure({
  label: "freshness probe vs healthy snapshot",
  roots: ["/app/src/ui/lib/snapshot-probe.ts"],
  src: freshnessProbe(accum.dts.text),
  hono: "real",
});
measure({
  label: "freshness probe vs stale snapshot",
  roots: ["/app/src/ui/lib/snapshot-probe.ts"],
  src: freshnessProbe(stale.dts.text),
  hono: "real",
});

const FRAGMENT_ENTRY = "/app/src/hono/_fragment.ts";
const fragmentSrc = {
  ...files,
  [FRAGMENT_ENTRY]: `import { entityRoutes } from "./org-protected/entities";
export type ApiType = typeof entityRoutes;
`,
};
const fragment = measure({
  label: "entities module, accumulating emit",
  roots: [FRAGMENT_ENTRY],
  src: fragmentSrc,
  hono: "accumulating",
  emit: true,
});
if (fragment.dts) {
  console.log(
    JSON.stringify({
      label: "entities fragment api.d.ts",
      bytes: fragment.dts.text.length,
      pathCount: fragment.dts.pathCount,
      methodCount: fragment.dts.methodCount,
      mentionsDrizzle: fragment.dts.mentionsDrizzle,
      unresolvedNames: fragment.dts.unresolvedNames,
      preview: fragment.dts.preview,
    })
  );
}

const publicOnly = (files[SERVER_ENTRY] ?? "").replace(
  `.route("/", publicRoutes)
  .route("/protected", protectedRoutes)
  .route("/dev", devRoutes);`,
  `.route("/", publicRoutes);`
);
if (publicOnly === files[SERVER_ENTRY]) {
  throw new Error("public-only overlay did not change hono/index.ts");
}

measure({
  label: "scale: public routes only",
  roots: [SERVER_ENTRY],
  src: { ...files, [SERVER_ENTRY]: publicOnly },
  hono: "accumulating",
  emit: true,
});

const publicEntitiesIndex = `import { Hono } from "hono";
import { entityRoutes } from "./org-protected/entities";
import { withAuth } from "./middleware/auth";
import { appErrorHandler } from "./middleware/error-handler";
import { publicRoutes } from "./public";
import type { AppEnv } from "./types";

const api = new Hono<AppEnv>()
  .use("*", withAuth)
  .route("/", publicRoutes)
  .route("/protected/entities", entityRoutes);

export const app = new Hono<AppEnv>()
  .onError(appErrorHandler)
  .route("/api", api);

export type ApiType = typeof api;
`;

measure({
  label: "scale: public + entities",
  roots: [SERVER_ENTRY],
  src: { ...files, [SERVER_ENTRY]: publicEntitiesIndex },
  hono: "accumulating",
  emit: true,
});
