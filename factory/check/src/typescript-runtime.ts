/**
 * Load TypeScript only after the Workers `__filename` shim is installed.
 *
 * A static `import "typescript"` is hoisted and can evaluate before module
 * body side effects — including a preceding `import "./ts-shim.js"`. The
 * dynamic import below runs only after {@link installTsShim} returns.
 */
import { installTsShim } from "./ts-shim.js";

installTsShim();

const ts = await import("typescript");

export const {
  createDocumentRegistry,
  createLanguageService,
  Extension,
  flattenDiagnosticMessageText,
  forEachChild,
  getDefaultLibFileName,
  isExportDeclaration,
  isImportDeclaration,
  isImportEqualsDeclaration,
  isNamedExports,
  isNamedImports,
  isTypeAliasDeclaration,
  JsxEmit,
  ModuleKind,
  ModuleResolutionKind,
  ScriptSnapshot,
  ScriptTarget,
  SyntaxKind,
  SymbolFlags,
  TypeFlags,
} = ts;

export type CompilerOptions = import("typescript").CompilerOptions;
export type Diagnostic = import("typescript").Diagnostic;
export type IScriptSnapshot = import("typescript").IScriptSnapshot;
export type IntersectionType = import("typescript").IntersectionType;
export type LanguageService = import("typescript").LanguageService;
export type LanguageServiceHost = import("typescript").LanguageServiceHost;
export type Node = import("typescript").Node;
export type NumberLiteralType = import("typescript").NumberLiteralType;
export type StringLiteralLike = import("typescript").StringLiteralLike;
export type StringLiteralType = import("typescript").StringLiteralType;
export type Symbol = import("typescript").Symbol;
export type Type = import("typescript").Type;
export type TypeAliasDeclaration = import("typescript").TypeAliasDeclaration;
export type TypeChecker = import("typescript").TypeChecker;
export type TypeReference = import("typescript").TypeReference;
export type UnionType = import("typescript").UnionType;
