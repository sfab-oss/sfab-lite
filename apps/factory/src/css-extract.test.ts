import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { extractCandidates } from "./css-extract.ts";

const here = dirname(fileURLToPath(import.meta.url));
const buttonPath = join(
  here,
  "../../../packages/template/app/src/ui/components/button.tsx"
);

describe("extractCandidates", () => {
  it("extracts a cva variant class that appears after a ) inside the base string", () => {
    const src = `
      const variants = cva(
        "base [&_svg:not([class*='size-'])]:size-4",
        {
          variants: {
            tone: {
              loud: "hover:bg-primary/80",
            },
          },
        }
      );
    `;
    const { candidates } = extractCandidates([src]);
    assert.ok(
      candidates.includes("hover:bg-primary/80"),
      `expected hover:bg-primary/80 in ${JSON.stringify(candidates)}`
    );
  });

  it("extracts classes from a cn() call that nests another call", () => {
    const src = `
      const cls = cn("outer-a", nested("ignored"), cn("inner-b", "inner-c"));
    `;
    const { candidates } = extractCandidates([src]);
    assert.ok(candidates.includes("outer-a"));
    assert.ok(candidates.includes("inner-b"));
    assert.ok(candidates.includes("inner-c"));
  });

  it("finds button.tsx variant classes the old [^)]* extractor missed", () => {
    const src = readFileSync(buttonPath, "utf8");
    const { candidates } = extractCandidates([src]);
    assert.ok(
      candidates.includes("hover:bg-primary/80"),
      "hover:bg-primary/80"
    );
    assert.ok(candidates.includes("size-9"), "size-9");
  });
});
