/**
 * TypeScript LanguageService host over the frozen types VFS.
 *
 * Owns compiler options, root-file selection, and module resolution wiring.
 * Per-app overlay / LS cache lives in `run-check.ts`.
 */
import { TYPES_VFS } from "@sfab-lite/kernel";
import { resolvePackage, resolveRelative } from "./resolve-modules.js";
import {
  type CompilerOptions,
  createDocumentRegistry,
  createLanguageService,
  Extension,
  getDefaultLibFileName,
  type IScriptSnapshot,
  isExportDeclaration,
  isImportDeclaration,
  isImportEqualsDeclaration,
  isNamedExports,
  isNamedImports,
  JsxEmit,
  type LanguageService,
  type LanguageServiceHost,
  ModuleKind,
  ModuleResolutionKind,
  ScriptSnapshot,
  ScriptTarget,
  type StringLiteralLike,
  SyntaxKind,
} from "./typescript-runtime.js";
import { directoryExists, normalizePath, readVfs } from "./vfs.js";

/** Frozen lib roots from TYPES_VFS — computed once. */
const LIB_ROOT_FILES: readonly string[] = Object.keys(TYPES_VFS)
  .filter((k) => k.startsWith("/libs/lib.") && k.endsWith(".d.ts"))
  .sort();

const AMBIENT_ROOT_FILES: readonly string[] = [
  "/types/cloudflare-ambient.d.ts",
  ...LIB_ROOT_FILES,
];

export interface AppLsState {
  overlay: Map<string, string>;
  versions: Map<string, number>;
  snapshots: Map<string, { version: number; snap: IScriptSnapshot }>;
  /** Stable root list — new array identity only when /app file set changes. */
  rootFiles: string[] | null;
  service: LanguageService | null;
}

export function createAppLsState(): AppLsState {
  return {
    overlay: new Map(),
    versions: new Map(),
    snapshots: new Map(),
    rootFiles: null,
    service: null,
  };
}

function compilerOptions(): CompilerOptions {
  return {
    target: ScriptTarget.ES2022,
    module: ModuleKind.ESNext,
    moduleResolution: ModuleResolutionKind.Bundler,
    strict: true,
    skipLibCheck: true,
    jsx: JsxEmit.ReactJSX,
    noLib: true,
    noEmit: true,
    allowJs: false,
    esModuleInterop: true,
    isolatedModules: true,
    allowImportingTsExtensions: true,
  };
}

function rootFilesFor(overlay: Map<string, string>): string[] {
  const fromOverlay = [...overlay.keys()]
    .filter(
      (k) =>
        k.startsWith("/app/src/") &&
        (k.endsWith(".ts") || k.endsWith(".tsx") || k.endsWith(".d.ts"))
    )
    .sort();
  return fromOverlay.length > 0
    ? [...fromOverlay, ...AMBIENT_ROOT_FILES]
    : [...AMBIENT_ROOT_FILES];
}

export function rootsForState(st: AppLsState): string[] {
  if (st.rootFiles) {
    return st.rootFiles;
  }
  st.rootFiles = rootFilesFor(st.overlay);
  return st.rootFiles;
}

function extensionForResolved(resolved: string) {
  if (resolved.endsWith(".tsx")) {
    return Extension.Tsx;
  }
  if (resolved.endsWith(".d.ts") || resolved.endsWith(".d.mts")) {
    return Extension.Dts;
  }
  return Extension.Ts;
}

function namedBindingsAreTypeOnly(
  bindings: import("typescript").NamedImportBindings | undefined
): boolean {
  if (!bindings || bindings.kind === SyntaxKind.NamespaceImport) {
    return false;
  }
  return (
    isNamedImports(bindings) &&
    bindings.elements.length > 0 &&
    bindings.elements.every((el) => el.isTypeOnly)
  );
}

function importDeclarationIsTypeOnly(
  decl: import("typescript").ImportDeclaration
): boolean {
  const clause = decl.importClause;
  if (!clause) {
    return false;
  }
  if (clause.isTypeOnly) {
    return true;
  }
  if (clause.name) {
    return false;
  }
  return namedBindingsAreTypeOnly(clause.namedBindings);
}

function exportDeclarationIsTypeOnly(
  decl: import("typescript").ExportDeclaration
): boolean {
  if (decl.isTypeOnly) {
    return true;
  }
  const clause = decl.exportClause;
  if (!(clause && isNamedExports(clause))) {
    return false;
  }
  return (
    clause.elements.length > 0 && clause.elements.every((el) => el.isTypeOnly)
  );
}

/**
 * Whether the module specifier is type-only (erased at emit). Value imports
 * of server modules from client code must fail; `import type` may cross.
 */
function moduleSpecifierIsTypeOnly(literal: StringLiteralLike): boolean {
  const parent = literal.parent;
  if (!parent) {
    return false;
  }
  if (isImportDeclaration(parent)) {
    return importDeclarationIsTypeOnly(parent);
  }
  if (isExportDeclaration(parent)) {
    return exportDeclarationIsTypeOnly(parent);
  }
  if (isImportEqualsDeclaration(parent)) {
    return parent.isTypeOnly;
  }
  return false;
}

export function getLanguageService(st: AppLsState): LanguageService {
  if (st.service) {
    return st.service;
  }

  const host: LanguageServiceHost = {
    getCompilationSettings: () => compilerOptions(),
    getScriptFileNames: () => rootsForState(st),
    getScriptVersion: (fileName) =>
      String(st.versions.get(normalizePath(fileName)) ?? 1),
    getScriptSnapshot: (fileName) => {
      const norm = normalizePath(fileName);
      const text = readVfs(fileName, st.overlay);
      if (text == null) {
        return;
      }
      const ver = st.versions.get(norm) ?? 1;
      const cached = st.snapshots.get(norm);
      if (cached && cached.version === ver) {
        return cached.snap;
      }
      const snap = ScriptSnapshot.fromString(text);
      st.snapshots.set(norm, { version: ver, snap });
      return snap;
    },
    getCurrentDirectory: () => "/",
    getDefaultLibFileName: (options) =>
      `/libs/${getDefaultLibFileName(options)}`,
    fileExists: (f) => readVfs(f, st.overlay) != null,
    readFile: (f) => readVfs(f, st.overlay),
    readDirectory: () => [],
    directoryExists: (dir) => directoryExists(dir, st.overlay),
    getDirectories: () => [],
    realpath: (f) => normalizePath(f),
    resolveModuleNameLiterals: (moduleLiterals, containingFile) =>
      moduleLiterals.map((lit) => {
        const name = lit.text;
        const opts = { typeOnly: moduleSpecifierIsTypeOnly(lit) };
        const resolved =
          resolvePackage(name, st.overlay, containingFile, opts) ??
          (name.startsWith(".")
            ? resolveRelative(name, containingFile, st.overlay, opts)
            : undefined);
        if (!resolved) {
          return { resolvedModule: undefined };
        }
        return {
          resolvedModule: {
            resolvedFileName: resolved,
            extension: extensionForResolved(resolved),
            isExternalLibraryImport: resolved.includes("/node_modules/"),
          },
        };
      }),
  };

  st.service = createLanguageService(host, createDocumentRegistry());
  return st.service;
}
