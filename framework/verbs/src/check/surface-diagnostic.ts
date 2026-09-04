/**
 * Rewrite surface-miss diagnostics so a curated stub looks like a surface
 * limit, not a library bug. LanguageService is already disposed at
 * summarize time — this only reads diagnostic strings, related paths, and
 * the catalog overlay still sitting on the VFS.
 */

const SURFACE_CODES = new Set([2339, 2345, 2554, 2551]);
const PROPERTY_MISSING = /Property '([^']+)' does not exist/;
const ON_TYPE = /\bon type '([^']+)'/;
const NODE_MODULES_PKG = /^\/node_modules\/((?:@[^/]+\/)?[^/]+)/;
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const HONO_PREFIX = "/node_modules/hono";
const HONO_TYPES = new Set([
  "Context",
  "Hono",
  "Handler",
  "ErrorHandler",
  "Validator",
  "EnvBase",
]);

export interface SurfaceRewriteInput {
  code: number;
  message: string;
  usageFile: string | undefined;
  relatedPaths: readonly string[];
  catalogOverlayKeys: ReadonlySet<string>;
  overlay: ReadonlyMap<string, string>;
  isClientUsage: boolean;
}

export function diagnosticRelatedPaths(d: {
  relatedInformation?: ReadonlyArray<{
    file?: { fileName: string } | undefined;
  }>;
}): string[] {
  const out: string[] = [];
  for (const info of d.relatedInformation ?? []) {
    const name = info.file?.fileName;
    if (name != null) {
      out.push(name);
    }
  }
  return out;
}

export function rewriteSurfaceDiagnostic(
  input: SurfaceRewriteInput
): string | undefined {
  if (!SURFACE_CODES.has(input.code)) {
    return;
  }
  if (input.usageFile == null || !input.usageFile.startsWith("/app/")) {
    return;
  }
  const pin = surfacePin(input);
  if (pin == null) {
    return;
  }
  const member = PROPERTY_MISSING.exec(input.message)?.[1];
  const typeName = stripGenerics(ON_TYPE.exec(input.message)?.[1]);
  const declared = missLabel(input.code, typeName, member);
  const verb =
    input.code === 2345 || input.code === 2554
      ? "does not accept"
      : "does not declare";
  return (
    `LITE-SURFACE: ${pin}'s checked surface ${verb} ${declared}. ` +
    "The module supports it at runtime; the surface is curated. " +
    "Fix: use what surface.d.ts declares, or request surface growth " +
    `(the app cannot add it).\n${input.message}`
  );
}

function missLabel(
  code: number,
  typeName: string | undefined,
  member: string | undefined
): string {
  if (member != null && typeName != null) {
    return `${typeName}.${member}`;
  }
  if (member != null) {
    return member;
  }
  if (typeName != null) {
    return typeName;
  }
  return code === 2345 || code === 2554 ? "this call" : "this member";
}

function stripGenerics(raw: string | undefined): string | undefined {
  if (raw == null) {
    return;
  }
  const cut = raw.indexOf("<");
  const name = (cut === -1 ? raw : raw.slice(0, cut)).trim();
  return IDENT.test(name) ? name : undefined;
}

function packageFromNodeModulesPath(path: string): string | undefined {
  return NODE_MODULES_PKG.exec(path)?.[1];
}

function isHonoPath(path: string): boolean {
  return path === HONO_PREFIX || path.startsWith(`${HONO_PREFIX}/`);
}

function surfacePin(input: SurfaceRewriteInput): string | undefined {
  for (const path of input.relatedPaths) {
    if (input.catalogOverlayKeys.has(path)) {
      return packageFromNodeModulesPath(path);
    }
    if (!input.isClientUsage && isHonoPath(path)) {
      return "hono";
    }
  }
  const typeName = stripGenerics(ON_TYPE.exec(input.message)?.[1]);
  if (typeName == null) {
    return;
  }
  const fromStub = pinFromCatalogStub(typeName, input);
  if (fromStub != null) {
    return fromStub;
  }
  if (!input.isClientUsage && HONO_TYPES.has(typeName)) {
    return "hono";
  }
}

function pinFromCatalogStub(
  typeName: string,
  input: SurfaceRewriteInput
): string | undefined {
  const decl = typeDeclRe(typeName);
  if (decl == null) {
    return;
  }
  const hits: string[] = [];
  for (const key of input.catalogOverlayKeys) {
    const text = input.overlay.get(key);
    if (text != null && decl.test(text)) {
      hits.push(key);
    }
  }
  if (hits.length !== 1) {
    return;
  }
  return packageFromNodeModulesPath(hits[0] ?? "");
}

function typeDeclRe(typeName: string): RegExp | undefined {
  if (!IDENT.test(typeName)) {
    return;
  }
  return new RegExp(
    `(?:export\\s+)?(?:declare\\s+)?(?:class|interface|type)\\s+${typeName}\\b`
  );
}
