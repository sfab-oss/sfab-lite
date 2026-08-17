import assert from "node:assert/strict";
import { test } from "node:test";
import { KERNEL_VERSION } from "@sfab-lite/kernel";
import { serveKernel } from "./serve-kernel.ts";

/**
 * The R2 fallback, which is what keeps already-published apps alive across a
 * kernel bump: their HTML pins `/kernel/<old version>/client/*`, those chunks
 * leave the Worker bundle when the kernel moves, and R2 is the only place left
 * to serve them from. Getting it wrong renders every published app as an empty
 * `#root` with no other gate noticing.
 *
 * Previously only observable after a deploy, by fetching a real published app.
 */

const OLD = "0.0.1-before";
const FILE = "react.js";

interface BucketState {
  manifest: boolean;
  chunk: string | null;
}

function stubEnv(state: BucketState) {
  const reads: string[] = [];
  const has = (key: string) =>
    key.endsWith("/manifest.json") ? state.manifest : state.chunk !== null;

  const bucket = {
    // biome-ignore lint/suspicious/useAwait: R2Bucket's methods are async.
    head: async (key: string) => {
      reads.push(`head ${key}`);
      return has(key) ? {} : null;
    },
    // biome-ignore lint/suspicious/useAwait: R2Bucket's methods are async.
    get: async (key: string) => {
      reads.push(`get ${key}`);
      return has(key) ? { body: state.chunk ?? "" } : null;
    },
  };

  return { reads, env: { KERNEL_R2: bucket } };
}

const get = (path: string) =>
  new Request(`https://factory.test/kernel/${path}`);
const head = (path: string) =>
  new Request(`https://factory.test/kernel/${path}`, { method: "HEAD" });

test("a path that is not a kernel chunk is left for another route", async () => {
  const { env } = stubEnv({ manifest: false, chunk: null });
  assert.equal(await serveKernel(get("nonsense"), "nonsense", env), null);
  assert.equal(
    await serveKernel(
      get(`${OLD}/client/style.css`),
      `${OLD}/client/style.css`,
      env
    ),
    null
  );
});

/**
 * The version the host still bundles must never reach R2 — an object read per
 * chunk on the hot path, for bytes already in the isolate.
 */
test("the current version is served from the bundle without touching R2", async () => {
  const { reads, env } = stubEnv({ manifest: false, chunk: null });
  const res = await serveKernel(
    get(`${KERNEL_VERSION}/client/${FILE}`),
    `${KERNEL_VERSION}/client/${FILE}`,
    env
  );

  assert.equal(res?.status, 200);
  assert.equal(
    res?.headers.get("content-type"),
    "application/javascript; charset=utf-8"
  );
  assert.equal(
    res?.headers.get("cache-control"),
    "public, max-age=31536000, immutable"
  );
  assert.deepEqual(reads, []);
});

test("a chunk the bundle does not have is a 404, not a version mismatch", async () => {
  const { env } = stubEnv({ manifest: false, chunk: null });
  const res = await serveKernel(
    get(`${KERNEL_VERSION}/client/not-a-chunk.js`),
    `${KERNEL_VERSION}/client/not-a-chunk.js`,
    env
  );
  assert.equal(res?.status, 404);
});

test("HEAD on a bundled chunk answers without a body", async () => {
  const { env } = stubEnv({ manifest: false, chunk: null });
  const res = await serveKernel(
    head(`${KERNEL_VERSION}/client/${FILE}`),
    `${KERNEL_VERSION}/client/${FILE}`,
    env
  );
  assert.equal(res?.status, 200);
  assert.equal(await res?.text(), "");
});

/**
 * The upload never ran for this version. `kernel_version_mismatch` is the
 * signal to look at the deploy's R2 step, so it must not be reported as a
 * missing chunk.
 */
test("an older version with no manifest is a 409 mismatch", async () => {
  const { env } = stubEnv({ manifest: false, chunk: "source" });
  const res = await serveKernel(
    get(`${OLD}/client/${FILE}`),
    `${OLD}/client/${FILE}`,
    env
  );

  assert.equal(res?.status, 409);
  assert.deepEqual(await res?.json(), {
    ok: false,
    error: "kernel_version_mismatch",
    requested: OLD,
    hostKernel: KERNEL_VERSION,
  });
});

test("an older version present in R2 is streamed from it", async () => {
  const { reads, env } = stubEnv({
    manifest: true,
    chunk: "export const x = 1;",
  });
  const res = await serveKernel(
    get(`${OLD}/client/${FILE}`),
    `${OLD}/client/${FILE}`,
    env
  );

  assert.equal(res?.status, 200);
  assert.equal(await res?.text(), "export const x = 1;");
  assert.equal(
    res?.headers.get("cache-control"),
    "public, max-age=31536000, immutable"
  );
  assert.deepEqual(reads, [
    `head kernels/${OLD}/manifest.json`,
    `get kernels/${OLD}/client/${FILE}`,
  ]);
});

/**
 * A known version whose object is absent is a partial upload, not a missing
 * one — a different fault with a different fix, so it gets its own status.
 */
test("a known version missing one chunk is a 500, not a 409", async () => {
  const { env } = stubEnv({ manifest: true, chunk: null });
  const res = await serveKernel(
    get(`${OLD}/client/${FILE}`),
    `${OLD}/client/${FILE}`,
    env
  );

  assert.equal(res?.status, 500);
  assert.deepEqual(await res?.json(), {
    ok: false,
    error: "kernel_chunk_missing",
    version: OLD,
    file: FILE,
  });
});

test("HEAD reports the same faults as GET", async () => {
  const missing = stubEnv({ manifest: true, chunk: null });
  const gone = await serveKernel(
    head(`${OLD}/client/${FILE}`),
    `${OLD}/client/${FILE}`,
    missing.env
  );
  assert.equal(gone?.status, 500);

  const present = stubEnv({ manifest: true, chunk: "source" });
  const found = await serveKernel(
    head(`${OLD}/client/${FILE}`),
    `${OLD}/client/${FILE}`,
    present.env
  );
  assert.equal(found?.status, 200);
  assert.equal(await found?.text(), "");
  assert.deepEqual(present.reads, [
    `head kernels/${OLD}/manifest.json`,
    `head kernels/${OLD}/client/${FILE}`,
  ]);
});

test("the client/ segment is optional in the request path", async () => {
  const { reads, env } = stubEnv({ manifest: true, chunk: "source" });
  const res = await serveKernel(get(`${OLD}/${FILE}`), `${OLD}/${FILE}`, env);

  assert.equal(res?.status, 200);
  assert.deepEqual(reads, [
    `head kernels/${OLD}/manifest.json`,
    `get kernels/${OLD}/client/${FILE}`,
  ]);
});
