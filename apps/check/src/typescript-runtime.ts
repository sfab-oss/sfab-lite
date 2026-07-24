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
  getDefaultLibFileName,
  JsxEmit,
  ModuleKind,
  ModuleResolutionKind,
  ScriptSnapshot,
  ScriptTarget,
} = ts;

export type CompilerOptions = import("typescript").CompilerOptions;
export type Diagnostic = import("typescript").Diagnostic;
export type IScriptSnapshot = import("typescript").IScriptSnapshot;
export type LanguageService = import("typescript").LanguageService;
export type LanguageServiceHost = import("typescript").LanguageServiceHost;
