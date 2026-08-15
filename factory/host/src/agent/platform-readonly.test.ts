import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertWritableWorkspacePath,
  isPlatformReadonlyPath,
  normalizeWorkspaceRelPath,
  PlatformReadonlyError,
  platformReadonlyPaths,
} from "./platform-readonly.ts";

const READ_ONLY_MSG = /read-only/;

describe("platform-readonly", () => {
  it("lists the seeded platform-owned roots", () => {
    assert.deepEqual(platformReadonlyPaths(), [
      "biome.json",
      "components.json",
      "tsconfig.json",
      "vite.config.ts",
    ]);
  });

  it("normalizes leading slashes and dot segments", () => {
    assert.equal(normalizeWorkspaceRelPath("/tsconfig.json"), "tsconfig.json");
    assert.equal(normalizeWorkspaceRelPath("./tsconfig.json"), "tsconfig.json");
    assert.equal(
      normalizeWorkspaceRelPath("foo/../tsconfig.json"),
      "tsconfig.json"
    );
    assert.equal(isPlatformReadonlyPath("/biome.json"), true);
    assert.equal(
      normalizeWorkspaceRelPath("../tsconfig.json"),
      "tsconfig.json"
    );
    assert.equal(isPlatformReadonlyPath("../biome.json"), true);
    assert.equal(isPlatformReadonlyPath("x/../vite.config.ts"), true);
    assert.equal(isPlatformReadonlyPath("package.json"), false);
    assert.equal(isPlatformReadonlyPath("/src/db/schema.ts"), false);
  });

  it("throws PlatformReadonlyError on assert", () => {
    assert.throws(
      () => assertWritableWorkspacePath("/vite.config.ts"),
      (err: unknown) =>
        err instanceof PlatformReadonlyError &&
        err.path === "vite.config.ts" &&
        READ_ONLY_MSG.test(err.message)
    );
    assert.doesNotThrow(() => assertWritableWorkspacePath("/src/router.tsx"));
  });
});
