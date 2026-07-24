/**
 * In-process regression for delete→re-add version monotonicity + diagnostics.
 * Bundled by the companion .mjs runner (esbuild) so Node can load workspace TS.
 */
import { type LsStore, runCheck } from "../src/run-check.ts";

const appId = "regression-delete-readd";
const absX = "/app/src/x.ts";

const withX = {
  "src/keep.ts": "export const keep = 1;\n",
  "src/x.ts": "export const x = 1;\n",
};
const withoutX = {
  "src/keep.ts": "export const keep = 1;\n",
};
const withXBroken = {
  "src/keep.ts": "export const keep = 1;\n",
  "src/x.ts": "export const x: number = 'must-diag';\n",
};

const store: LsStore = new Map();

function versionOfX(): number | undefined {
  return store.get(appId)?.versions.get(absX);
}

function step(label: string, files: Record<string, string>) {
  const result = runCheck({ appId, files, forceCold: false }, { store });
  const version = versionOfX();
  console.log(
    JSON.stringify({
      label,
      ok: result.ok,
      diagnosticCount: result.diagnosticCount,
      diagnostics: result.diagnostics,
      lsReused: result.lsReused,
      bumpedFiles: result.bumpedFiles,
      versionOfX: version ?? null,
    })
  );
  return { result, version };
}

const first = step("1-add", withX);
if (!first.result.ok || first.version !== 1) {
  console.error("FAIL: initial add should be clean at version 1");
  process.exit(1);
}

const second = step("2-delete", withoutX);
if (!second.result.ok) {
  console.error("FAIL: delete-only tree should be clean");
  process.exit(1);
}
// After fix: version remains and was bumped on delete. Before fix: null.
if (second.version == null) {
  console.error(
    "FAIL: version was deleted on remove (must bump, never delete)"
  );
  process.exit(1);
}

const third = step("3-readd-broken", withXBroken);
const saw = third.result.diagnostics.some(
  (d) => d.code === 2322 && (d.file?.includes("src/x.ts") ?? false)
);
if (!saw || third.result.ok) {
  console.error(
    "FAIL: re-add with bad content did not surface TS2322 (stale LS)"
  );
  process.exit(1);
}
if (third.version == null || third.version <= (first.version ?? 0)) {
  console.error(
    `FAIL: version not monotonic (first=${first.version}, readd=${third.version})`
  );
  process.exit(1);
}

console.log("PASS: delete→re-add is version-monotonic and surfaces TS2322");
