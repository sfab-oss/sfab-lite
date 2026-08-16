import type { CheckDiagnostic } from "@sfab-lite/core";
import { API_HASH } from "./generated-paths.js";

const LITE_SNAPSHOT_STALE_CODE = 9001;

function snapshotHashPath(): string {
  return `/app/${API_HASH}`;
}

/**
 * Named diagnostic for invariant 6. A mismatched hash is a check failure,
 * not a skipped client unit.
 */
export function snapshotFreshnessDiagnostic(
  expected: string,
  got: string | undefined
): CheckDiagnostic {
  const gotText = got == null || got === "" ? "(missing)" : got;
  return {
    code: LITE_SNAPSHOT_STALE_CODE,
    message:
      "LITE-SNAPSHOT: snapshot hash does not match the current server tree. " +
      `Expected ${expected}; got ${gotText}. The client was not checked.`,
    file: snapshotHashPath(),
  };
}

export function hashesMatch(
  expected: string,
  got: string | undefined
): boolean {
  return got != null && got === expected;
}
