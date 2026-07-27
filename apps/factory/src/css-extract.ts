/**
 * Naive JS class extractor — stand-in for oxide Scanner (exp-11).
 */
const ATTR_RE = /(?:class|className)\s*=\s*(?:"([^"]*)"|'([^']*)'|`([^`]*)`)/g;
const CN_HEAD_RE = /\b(?:cn|clsx|cva)\s*\(/g;
const WHITESPACE_RE = /\s+/;

const MISSES_DOCUMENTED = [
  "Computed class names: `cn(cond && 'hidden')` non-literal branches",
  "Template literals with interpolation (e.g. dynamic color tokens)",
  "Dynamic object keys / arrays of classes built at runtime",
  "Classes only present in CSS @apply (not in source attributes)",
  "Safelist / `@source inline(...)` — not auto-applied here",
] as const;

function addTokensFromRaw(set: Set<string>, raw: string): void {
  for (const tok of raw.split(WHITESPACE_RE)) {
    if (tok) {
      set.add(tok);
    }
  }
}

function extractFromAttrs(src: string, set: Set<string>): void {
  ATTR_RE.lastIndex = 0;
  for (;;) {
    const m = ATTR_RE.exec(src);
    if (!m) {
      break;
    }
    const raw = m[1] ?? m[2] ?? m[3] ?? "";
    addTokensFromRaw(set, raw);
  }
}

function scanQuotedSpan(src: string, start: number): number {
  const quote = src[start];
  let escaped = false;
  for (let i = start + 1; i < src.length; i++) {
    const ch = src[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === quote) {
      return i + 1;
    }
  }
  return src.length;
}

function findBalancedClose(src: string, openIdx: number): number {
  let depth = 1;
  let i = openIdx + 1;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      i = scanQuotedSpan(src, i);
      continue;
    }
    if (ch === "(") {
      depth++;
    } else if (ch === ")") {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
    i++;
  }
  return -1;
}

function addTokensFromLiteralBody(set: Set<string>, body: string): void {
  for (const tok of body.split(WHITESPACE_RE)) {
    if (tok && !tok.includes("${")) {
      set.add(tok);
    }
  }
}

function extractTokensFromCnInner(inner: string, set: Set<string>): void {
  let i = 0;
  while (i < inner.length) {
    const ch = inner[i];
    if (ch !== '"' && ch !== "'" && ch !== "`") {
      i++;
      continue;
    }
    const end = scanQuotedSpan(inner, i);
    const closer = end - 1;
    if (closer <= i || inner[closer] !== ch) {
      break;
    }
    addTokensFromLiteralBody(set, inner.slice(i + 1, closer));
    i = end;
  }
}

function extractFromCnCalls(src: string, set: Set<string>): void {
  CN_HEAD_RE.lastIndex = 0;
  for (;;) {
    const m = CN_HEAD_RE.exec(src);
    if (!m) {
      break;
    }
    const openIdx = m.index + m[0].length - 1;
    const closeIdx = findBalancedClose(src, openIdx);
    if (closeIdx < 0) {
      extractTokensFromCnInner(src.slice(openIdx + 1), set);
      break;
    }
    extractTokensFromCnInner(src.slice(openIdx + 1, closeIdx), set);
    CN_HEAD_RE.lastIndex = closeIdx + 1;
  }
}

export function extractCandidates(sources: string[]): {
  candidates: string[];
  missesDocumented: string[];
} {
  const set = new Set<string>();

  for (const src of sources) {
    extractFromAttrs(src, set);
    extractFromCnCalls(src, set);
  }

  return {
    candidates: [...set].sort(),
    missesDocumented: [...MISSES_DOCUMENTED],
  };
}
