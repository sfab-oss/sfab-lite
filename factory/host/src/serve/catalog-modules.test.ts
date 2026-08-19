import assert from "node:assert/strict";
import { test } from "node:test";
import { catalogLoaderModules } from "./catalog-modules.ts";

function stubBucket(state: { manifest: boolean; esm: string | null }) {
  const reads: string[] = [];
  const bucket = {
    // biome-ignore lint/suspicious/useAwait: R2Bucket's methods are async.
    head: async (key: string) => {
      reads.push(`head ${key}`);
      if (key.endsWith("/manifest.json")) {
        return state.manifest ? {} : null;
      }
      return state.esm == null ? null : {};
    },
    // biome-ignore lint/suspicious/useAwait: R2Bucket's methods are async.
    get: async (key: string) => {
      reads.push(`get ${key}`);
      if (state.esm == null) {
        return null;
      }
      return {
        text: async () => state.esm ?? "",
      };
    },
  };
  return { reads, bucket };
}

test("empty modules skip R2", async () => {
  const { reads, bucket } = stubBucket({ manifest: false, esm: null });
  const result = await catalogLoaderModules(bucket, []);
  assert.deepEqual(result, { ok: true, modules: {} });
  assert.deepEqual(reads, []);
});

test("a declared module with no R2 manifest is a named 409", async () => {
  const { reads, bucket } = stubBucket({ manifest: false, esm: "export {}" });
  const result = await catalogLoaderModules(bucket, [
    { name: "pdf-lib", version: "1.17.1" },
  ]);
  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }
  assert.equal(result.response.status, 409);
  assert.deepEqual(await result.response.json(), {
    ok: false,
    error: "catalog_module_missing",
    requested: "pdf-lib@1.17.1",
  });
  assert.deepEqual(reads, ["head modules/pdf-lib@1.17.1/manifest.json"]);
});

test("a present module mounts as pdf-lib.js", async () => {
  const { reads, bucket } = stubBucket({
    manifest: true,
    esm: "export const PDFDocument = {};",
  });
  const result = await catalogLoaderModules(
    bucket,
    [{ name: "pdf-lib", version: "1.17.1" }],
    "^0"
  );
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.deepEqual(result.modules, {
    "pdf-lib.js": { js: "export const PDFDocument = {};" },
  });
  assert.deepEqual(reads, [
    "head modules/pdf-lib@1.17.1/manifest.json",
    "get modules/pdf-lib@1.17.1/pdf-lib.esm.js",
  ]);
});
