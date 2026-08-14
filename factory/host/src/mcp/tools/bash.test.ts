import assert from "node:assert/strict";
import { test } from "node:test";

/**
 * MCP `bash` returns this shape from AppAgent.runShell. Kept as a pure
 * contract test so the hard-cut away from named app_* tools stays honest.
 */
function bashToolPayload(
  command: string,
  result: { stdout: string; stderr: string; exitCode: number }
) {
  return {
    command,
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    passed: result.exitCode === 0,
  };
}

test("bash tool payload marks non-zero exit as passed:false without erroring", () => {
  assert.deepEqual(
    bashToolPayload("pnpm typecheck", {
      stdout: "error TS",
      stderr: "",
      exitCode: 1,
    }),
    {
      command: "pnpm typecheck",
      stdout: "error TS",
      stderr: "",
      exitCode: 1,
      passed: false,
    }
  );
});

test("bash tool payload marks zero exit as passed:true", () => {
  assert.deepEqual(
    bashToolPayload("pnpm lint", { stdout: "", stderr: "", exitCode: 0 }),
    {
      command: "pnpm lint",
      stdout: "",
      stderr: "",
      exitCode: 0,
      passed: true,
    }
  );
});
