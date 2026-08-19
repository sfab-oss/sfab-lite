import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DRIZZLE_KIT_VERSION,
  DRIZZLE_ORM_VERSION,
  drizzleKitLoaderModules,
  drizzleKitToolVersion,
} from "./drizzle-kit-modules.ts";

describe("drizzle-kit bundled modules", () => {
  it("exposes the pinned kit+orm version", () => {
    assert.equal(DRIZZLE_KIT_VERSION, "0.31.10");
    assert.equal(DRIZZLE_ORM_VERSION, "0.45.2");
    assert.equal(drizzleKitToolVersion(), "0.31.10-0.45.2");
  });

  it("loads api.mjs as a source string for the Loader child", () => {
    const modules = drizzleKitLoaderModules();
    assert.equal(typeof modules["api.mjs"]?.js, "string");
    assert.ok((modules["api.mjs"]?.js.length ?? 0) > 0);
    assert.ok(
      Object.keys(modules).some((p) => p.startsWith("vendor/drizzle-orm/"))
    );
  });

  it("returns the same map object on every call", () => {
    assert.equal(drizzleKitLoaderModules(), drizzleKitLoaderModules());
  });
});
