/**
 * Workers-native CSS publish (exp-11 productized).
 * Styles entry comes from TEMPLATE_MANIFEST — missing entry fails explicitly.
 */

import { TW_CSS_VFS } from "@sfab-lite/kernel";
import { TEMPLATE_MANIFEST } from "@sfab-lite/template";
import { compile } from "tailwindcss";
import { extractCandidates } from "./css-extract.js";

/** @apply-only / theme base classes the extractor cannot see in TSX. */
const BUILTIN_SAFELIST = [
  "border-border",
  "outline-ring/50",
  "bg-background",
  "text-foreground",
];

const RELATIVE_PATH_PREFIX_RE = /^\.\//;

function resolveStylesheetKey(id: string): string {
  if (id.startsWith("tailwindcss")) {
    return id;
  }
  if (id.startsWith("./") || id.startsWith("../")) {
    return `tailwindcss/${id.replace(RELATIVE_PATH_PREFIX_RE, "")}`;
  }
  return id;
}

function loadStylesheet(id: string, base: string) {
  const key = resolveStylesheetKey(id);

  const content =
    TW_CSS_VFS[key] ??
    TW_CSS_VFS[id] ??
    TW_CSS_VFS[`tailwindcss/${id}`] ??
    TW_CSS_VFS[`tailwindcss/${id}.css`];

  if (!content) {
    throw new Error(`loadStylesheet: unknown id=${id} base=${base}`);
  }
  return Promise.resolve({
    path: key,
    base: "/virtual/tailwindcss",
    content,
  });
}

type Compiler = Awaited<ReturnType<typeof compile>>;
let cached: Compiler | null = null;
let cachedTheme = "";

async function getCompiler(themeCss: string): Promise<Compiler> {
  if (cached && cachedTheme === themeCss) {
    return cached;
  }
  cached = await compile(themeCss, {
    base: "/virtual/tailwindcss",
    loadStylesheet,
  });
  cachedTheme = themeCss;
  return cached;
}

export interface CompileCssResult {
  css: string;
  compileMs: number;
  buildMs: number;
  candidateCount: number;
  candidates: string[];
  missesDocumented: string[];
}

/**
 * Publish CSS from app sources + theme (manifest `client.styles`).
 * `safelist` = extra class tokens (file or builtin).
 */
export async function compileCss(
  sourceFiles: Record<string, string>,
  opts?: { safelist?: string[] }
): Promise<CompileCssResult> {
  const stylesPath = TEMPLATE_MANIFEST.client.styles;
  const themeCss = sourceFiles[stylesPath];
  if (themeCss == null) {
    throw new Error(`compileCss: missing styles entry ${stylesPath}`);
  }

  const texts = Object.entries(sourceFiles)
    .filter(([k]) => !k.endsWith(".css"))
    .map(([, v]) => v);

  const { candidates, missesDocumented } = extractCandidates(texts);
  const safelist = [...BUILTIN_SAFELIST, ...(opts?.safelist ?? [])];
  const fileList = sourceFiles[TEMPLATE_MANIFEST.safelist];
  if (fileList) {
    for (const line of fileList.split("\n")) {
      const t = line.trim();
      if (t && !t.startsWith("#")) {
        safelist.push(t);
      }
    }
  }
  const all = [...new Set([...candidates, ...safelist])].sort();

  const t0 = performance.now();
  const compiler = await getCompiler(themeCss);
  const compileMs = performance.now() - t0;
  const t1 = performance.now();
  const css = compiler.build(all);
  const buildMs = performance.now() - t1;

  return {
    css,
    compileMs,
    buildMs,
    candidateCount: all.length,
    candidates: all,
    missesDocumented,
  };
}
