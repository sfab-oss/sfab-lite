import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertHostGeneratedPath,
  assertWritableWorkspacePath,
  GeneratedPathError,
  isHostGeneratedPath,
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
      "index.html",
      "package.json",
      "src/db/index.ts",
      "src/storage/index.ts",
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
    assert.equal(isPlatformReadonlyPath("package.json"), true);
    assert.equal(isPlatformReadonlyPath("index.html"), true);
    assert.equal(isPlatformReadonlyPath("/src/db/schema.ts"), false);
  });

  it("treats src/generated as a prefix, not an exact path", () => {
    assert.equal(isPlatformReadonlyPath("src/generated"), true);
    assert.equal(isPlatformReadonlyPath("/src/generated/api.d.ts"), true);
    assert.equal(isPlatformReadonlyPath("src/generated/api.hash"), true);
    assert.equal(isPlatformReadonlyPath("src/generated-elsewhere.ts"), false);
    assert.equal(isPlatformReadonlyPath("src/routes/overview.tsx"), false);
  });

  it("throws PlatformReadonlyError on assert", () => {
    assert.throws(
      () => assertWritableWorkspacePath("/vite.config.ts"),
      (err: unknown) =>
        err instanceof PlatformReadonlyError &&
        err.path === "vite.config.ts" &&
        READ_ONLY_MSG.test(err.message)
    );
    assert.throws(
      () => assertWritableWorkspacePath("/src/generated/api.d.ts"),
      PlatformReadonlyError
    );
    assert.doesNotThrow(() => assertWritableWorkspacePath("/src/router.tsx"));
  });

  it("writeGenerated is only for generated format members", () => {
    assert.equal(isHostGeneratedPath("package.json"), true);
    assert.equal(isHostGeneratedPath("src/db/index.ts"), true);
    assert.equal(isHostGeneratedPath("src/storage/index.ts"), true);
    assert.equal(isHostGeneratedPath("src/db/schema.ts"), false);
    assert.equal(isHostGeneratedPath("src/generated/api.d.ts"), true);
    assert.equal(isHostGeneratedPath("biome.json"), false);
    assert.equal(isHostGeneratedPath("vite.config.ts"), false);
    assert.equal(isHostGeneratedPath("src/router.tsx"), false);
    assert.doesNotThrow(() =>
      assertHostGeneratedPath("/src/generated/api.hash")
    );
    assert.throws(
      () => assertHostGeneratedPath("/src/router.tsx"),
      GeneratedPathError
    );
  });
});
