import assert from "node:assert/strict";
import { test } from "node:test";
import type { CheckDiagnostic, CheckResult } from "@sfab-lite/core";
import { renderCheckText } from "./render-diagnostics.ts";

function ran(diagnostics: CheckDiagnostic[]): CheckResult {
  return {
    ok: true,
    appId: "app_01ABC",
    pass: "incremental",
    diagnosticCount: diagnostics.length,
    truncated: false,
    diagnostics,
    checkMs: 1,
    wallMs: 2,
    rootFileCount: 3,
    bumpedFiles: [],
    lsReused: true,
    vfsFileCount: 4,
  };
}

test("a clean check renders nothing", () => {
  assert.equal(renderCheckText(ran([])), "");
});

test("a diagnostic renders as tsc-style text the model can act on", () => {
  const text = renderCheckText(
    ran([
      {
        code: 2322,
        message: "Type 'string' is not assignable to type 'number'.",
        file: "/app/src/x.ts",
        line: 1,
        column: 14,
      },
    ])
  );
  assert.equal(
    text,
    "src/x.ts:1:14: error TS2322: Type 'string' is not assignable to type 'number'.\nFound 1 error.\n"
  );
});

test("a positionless diagnostic still names its file", () => {
  const text = renderCheckText(ran([{ code: 5096, message: "Bad option." }]));
  assert.equal(text, "<unknown>: error TS5096: Bad option.\nFound 1 error.\n");
});

test("truncation is reported, so a capped list never reads as the whole list", () => {
  const body = ran([{ code: 2322, message: "One.", file: "/app/a.ts" }]);
  const text = renderCheckText({
    ...body,
    diagnosticCount: 41,
    truncated: true,
  });
  assert.ok(text.includes("… 40 more diagnostic(s) truncated"));
  assert.ok(text.includes("Found 41 errors."));
});

/**
 * The regression this file exists for: a worker that could not answer once
 * rendered the same text as code with type errors, so `pnpm typecheck` told
 * an agent "ok=false" and nothing else for both.
 */
test("a worker failure renders its reason, not a bare verdict", () => {
  const text = renderCheckText({ ok: false, error: "boom in the VFS" });
  assert.ok(text.includes("boom in the VFS"));
});

test("no body is distinguishable from a worker that answered", () => {
  assert.notEqual(
    renderCheckText(null),
    renderCheckText({ ok: false, error: "boom" })
  );
});
