/**
 * Naive JS class extractor — stand-in for oxide Scanner (exp-11).
 */
const ATTR_RE = /(?:class|className)\s*=\s*(?:"([^"]*)"|'([^']*)'|`([^`]*)`)/g;
const CN_RE = /\b(?:cn|clsx|cva)\s*\(([^)]*)\)/g;
const LIT_RE = /["'`]([^"'`]+)["'`]/g;

export function extractCandidates(sources: string[]): {
  candidates: string[];
  missesDocumented: string[];
} {
  const set = new Set<string>();

  for (const src of sources) {
    ATTR_RE.lastIndex = 0;
    for (;;) {
      const m = ATTR_RE.exec(src);
      if (!m) {
        break;
      }
      const raw = m[1] ?? m[2] ?? m[3] ?? "";
      for (const tok of raw.split(/\s+/)) {
        if (tok) {
          set.add(tok);
        }
      }
    }

    CN_RE.lastIndex = 0;
    for (;;) {
      const m = CN_RE.exec(src);
      if (!m) {
        break;
      }
      const inner = m[1];
      if (!inner) {
        continue;
      }
      LIT_RE.lastIndex = 0;
      for (;;) {
        const lit = LIT_RE.exec(inner);
        if (!lit) {
          break;
        }
        const litBody = lit[1];
        if (!litBody) {
          continue;
        }
        for (const tok of litBody.split(/\s+/)) {
          if (tok && !tok.includes("${")) {
            set.add(tok);
          }
        }
      }
    }
  }

  return {
    candidates: [...set].sort(),
    missesDocumented: [
      "Computed class names: `cn(cond && 'hidden')` non-literal branches",
      "Template literals with interpolation (e.g. dynamic color tokens)",
      "Dynamic object keys / arrays of classes built at runtime",
      "Classes only present in CSS @apply (not in source attributes)",
      "Safelist / `@source inline(...)` — not auto-applied here",
    ],
  };
}
