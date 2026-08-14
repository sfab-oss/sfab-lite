/**
 * Standalone api.d.ts emit from an accumulating Hono program.
 *
 * Walks `_schema` structurally (not `typeToString`) so the file does not keep
 * `import("hono").RouteEntry`, drizzle, or `AppEnv`. Wildcard / `$all` routes
 * are omitted. Prefix-merge concatenates mapped entries under a path prefix.
 */

import { joinRoutePrefix } from "./server-tree.js";
import {
  forEachChild,
  type IntersectionType,
  isTypeAliasDeclaration,
  type LanguageService,
  type Node,
  type NumberLiteralType,
  type StringLiteralType,
  SymbolFlags,
  type Symbol as TsSymbol,
  type Type,
  type TypeAliasDeclaration,
  type TypeChecker,
  TypeFlags,
  type TypeReference,
  type UnionType,
} from "./typescript-runtime.js";

const DRIZZLE_RE = /drizzle/i;
const HONO_INDEX_RE = /hono\/index/;
const UNRESOLVED_RE =
  /\b(AppEnv|Auth|Db|ExtractSchema|HonoBase|MergeSchemaPath)\b/;
const METHOD_NAMES = new Set(["$get", "$post", "$patch", "$delete"]);

function typeOfProp(
  checker: TypeChecker,
  type: Type,
  name: string
): Type | undefined {
  const sym = checker.getPropertyOfType(type, name);
  if (!sym) {
    return;
  }
  return checker.getTypeOfSymbol(sym);
}

function unwrap(checker: TypeChecker, type: Type): Type {
  let current = type;
  for (let i = 0; i < 6; i += 1) {
    const symbolName =
      current.aliasSymbol?.getName() ?? current.getSymbol()?.getName();
    if (symbolName === "Promise") {
      const args =
        current.aliasTypeArguments ?? (current as TypeReference).typeArguments;
      if (args?.[0]) {
        current = args[0];
        continue;
      }
    }
    const body = typeOfProp(checker, current, "__body");
    if (body) {
      current = body;
      continue;
    }
    break;
  }
  return current;
}

function hasTypeFlag(type: Type, flag: number): boolean {
  // biome-ignore lint/suspicious/noBitwiseOperators: TypeFlags is a bitfield
  return (type.getFlags() & flag) !== 0;
}

function printLiteral(type: Type): string | undefined {
  if (hasTypeFlag(type, TypeFlags.Never)) {
    return "never";
  }
  if (hasTypeFlag(type, TypeFlags.Any)) {
    return "any";
  }
  if (hasTypeFlag(type, TypeFlags.Unknown)) {
    return "unknown";
  }
  if (hasTypeFlag(type, TypeFlags.Void)) {
    return "void";
  }
  if (hasTypeFlag(type, TypeFlags.Null)) {
    return "null";
  }
  if (hasTypeFlag(type, TypeFlags.Undefined)) {
    return "undefined";
  }
  if (hasTypeFlag(type, TypeFlags.String)) {
    return "string";
  }
  if (hasTypeFlag(type, TypeFlags.Number)) {
    return "number";
  }
  if (hasTypeFlag(type, TypeFlags.Boolean)) {
    return "boolean";
  }
  if (hasTypeFlag(type, TypeFlags.StringLiteral)) {
    return JSON.stringify((type as StringLiteralType).value);
  }
  if (hasTypeFlag(type, TypeFlags.NumberLiteral)) {
    return String((type as NumberLiteralType).value);
  }
  if (hasTypeFlag(type, TypeFlags.BooleanLiteral)) {
    return (type as Type & { intrinsicName: string }).intrinsicName === "true"
      ? "true"
      : "false";
  }
}

function printFields(
  checker: TypeChecker,
  props: TsSymbol[],
  hint: Node,
  depth: number
): string {
  const seen = new Set<string>();
  const fields: string[] = [];
  for (const p of props) {
    if (seen.has(p.name) || p.name.startsWith("__")) {
      continue;
    }
    seen.add(p.name);
    const optional =
      // biome-ignore lint/suspicious/noBitwiseOperators: SymbolFlags is a bitfield
      (p.getFlags() & SymbolFlags.Optional) !== 0;
    const pt = unwrap(checker, checker.getTypeOfSymbolAtLocation(p, hint));
    fields.push(
      `${JSON.stringify(p.name)}${optional ? "?" : ""}: ${printExpanded(checker, pt, hint, depth + 1)}`
    );
  }
  return `{ ${fields.join("; ")} }`;
}

function printExpanded(
  checker: TypeChecker,
  type: Type,
  hint: Node,
  depth = 0
): string {
  if (depth > 14) {
    return "unknown";
  }
  const literal = printLiteral(type);
  if (literal) {
    return literal;
  }
  if (hasTypeFlag(type, TypeFlags.Union)) {
    return (type as UnionType).types
      .map((t) => printExpanded(checker, t, hint, depth + 1))
      .join(" | ");
  }
  if (hasTypeFlag(type, TypeFlags.Intersection)) {
    const parts = (type as IntersectionType).types.filter(
      (t) =>
        !hasTypeFlag(t, TypeFlags.Object) ||
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
    type.aliasTypeArguments ?? (type as TypeReference).typeArguments;
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
  if (hasTypeFlag(type, TypeFlags.Object)) {
    return "{}";
  }
  return "unknown";
}

function printSchema(
  checker: TypeChecker,
  schemaType: Type,
  hint: Node
): { text: string; pathCount: number; methodCount: number } {
  const paths = checker.getPropertiesOfType(schemaType);
  let methodCount = 0;
  const entries: string[] = [];
  for (const pathSym of paths) {
    const pathType = checker.getTypeOfSymbolAtLocation(pathSym, hint);
    const methods = checker
      .getPropertiesOfType(pathType)
      .filter((m) => METHOD_NAMES.has(m.name));
    if (methods.length === 0) {
      continue;
    }
    methodCount += methods.length;
    const methodEntries = methods.map((m) => {
      const mt = unwrap(checker, checker.getTypeOfSymbolAtLocation(m, hint));
      const input =
        typeOfProp(checker, mt, "input") ??
        typeOfProp(checker, pathType, "input");
      const output = typeOfProp(checker, mt, "output");
      const status = typeOfProp(checker, mt, "status");
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
  checker: TypeChecker,
  apiType: Type,
  hint: Node
): { text: string; pathCount: number; methodCount: number } {
  const schemaProp = typeOfProp(checker, apiType, "_schema");
  if (schemaProp) {
    return printSchema(checker, schemaProp, hint);
  }
  const args = (apiType as TypeReference).typeArguments;
  if (args && args.length >= 2 && args[1]) {
    return printSchema(checker, args[1], hint);
  }
  return printSchema(checker, apiType, hint);
}

function findApiTypeAlias(sf: Node): TypeAliasDeclaration | undefined {
  let found: TypeAliasDeclaration | undefined;
  const visit = (node: Node) => {
    if (isTypeAliasDeclaration(node) && node.name.text === "ApiType") {
      found = node;
      return;
    }
    forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

export interface EmittedApiDts {
  text: string;
  schemaText: string;
  mentionsDrizzle: boolean;
  mentionsHonoIndex: boolean;
  unresolvedNames: boolean;
  pathCount: number;
  methodCount: number;
}

export function wrapApiDts(schemaText: string): string {
  return `export type ApiType = import("hono").Hono<any, ${schemaText}>;\n`;
}

export function generateApiDts(
  ls: LanguageService,
  entry: string
): EmittedApiDts {
  const prog = ls.getProgram();
  if (!prog) {
    throw new Error("generateApiDts: no program");
  }
  const sf = prog.getSourceFile(entry);
  if (!sf) {
    throw new Error(`generateApiDts: missing ${entry}`);
  }
  const checker = prog.getTypeChecker();
  const apiNode = findApiTypeAlias(sf);
  if (!apiNode?.type) {
    throw new Error("generateApiDts: ApiType alias not found");
  }
  const apiType = checker.getTypeFromTypeNode(apiNode.type);
  const schema = schemaFromApiType(checker, apiType, apiNode);
  const text = wrapApiDts(schema.text);
  return {
    text,
    schemaText: schema.text,
    mentionsDrizzle: DRIZZLE_RE.test(text),
    mentionsHonoIndex: HONO_INDEX_RE.test(text),
    unresolvedNames: UNRESOLVED_RE.test(text),
    pathCount: schema.pathCount,
    methodCount: schema.methodCount,
  };
}

const SCHEMA_IN_HONO =
  /export type ApiType = import\("hono"\)\.Hono<any, (\{[\s\S]*\})>;\s*$/;
const BARE_SCHEMA = /export type ApiType = (\{[\s\S]*\});\s*$/;

export function extractSchemaText(dts: string): string | undefined {
  const hono = SCHEMA_IN_HONO.exec(dts);
  if (hono?.[1]) {
    return hono[1];
  }
  const bare = BARE_SCHEMA.exec(dts);
  return bare?.[1];
}

function skipSchemaSep(inner: string, start: number): number {
  let i = start;
  while (
    i < inner.length &&
    (inner[i] === " " || inner[i] === ";" || inner[i] === "\n")
  ) {
    i += 1;
  }
  return i;
}

function scanObjectLiteral(inner: string, start: number): number {
  let i = start;
  let depth = 0;
  while (i < inner.length) {
    const ch = inner[i];
    if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      i += 1;
      if (depth === 0) {
        return i;
      }
      continue;
    }
    i += 1;
  }
  return i;
}

/** Depth-1 `"path": { methods }` entries from a schema type literal. */
export function parseSchemaEntries(schemaText: string): Map<string, string> {
  const map = new Map<string, string>();
  const body = schemaText.trim();
  if (!(body.startsWith("{") && body.endsWith("}"))) {
    return map;
  }
  const inner = body.slice(1, -1).trim();
  let i = 0;
  while (i < inner.length) {
    i = skipSchemaSep(inner, i);
    if (i >= inner.length || inner[i] !== '"') {
      break;
    }
    const keyStart = i + 1;
    const keyEnd = inner.indexOf('"', keyStart);
    if (keyEnd < 0) {
      break;
    }
    const key = inner.slice(keyStart, keyEnd);
    i = keyEnd + 1;
    while (i < inner.length && inner[i] !== "{") {
      i += 1;
    }
    if (inner[i] !== "{") {
      break;
    }
    const valueStart = i;
    i = scanObjectLiteral(inner, i);
    map.set(key, inner.slice(valueStart, i).trim());
  }
  return map;
}

export function printSchemaEntries(entries: Map<string, string>): string {
  const parts: string[] = [];
  for (const key of [...entries.keys()].sort()) {
    const value = entries.get(key);
    if (value) {
      parts.push(`"${key}": ${value}`);
    }
  }
  return `{ ${parts.join("; ")} }`;
}

export function prefixMergeSchema(
  base: Map<string, string>,
  prefix: string,
  fragment: Map<string, string>
): Map<string, string> {
  const next = new Map(base);
  for (const [path, methods] of fragment) {
    next.set(joinRoutePrefix(prefix, path), methods);
  }
  return next;
}

export function fragmentSource(exportName: string, fromSpec: string): string {
  return `import { ${exportName} } from "${fromSpec}";\nexport type ApiType = typeof ${exportName};\n`;
}
