/**
 * Ask an app's own code what schema it declares.
 *
 * `diffSchema` needs a `desired` snapshot, and only drizzle can produce one —
 * `getTableConfig` is the sole thing that knows a `sqliteTable(...)` call means
 * a table with these columns. drizzle lives in the frozen kernel, alongside the
 * app, not in the factory. So rather than reimplement it, we compile a second
 * tiny entry over the app's own sources, load it through the same Worker Loader
 * that serves the app, and ask it.
 *
 * ## Why this is not a new privilege
 *
 * The factory already loads and runs app code — `serveApiRoute` does it on
 * every request. The probe is strictly less privileged than that: no `DB`, no
 * auth secret, no bindings at all, and `globalOutbound: null`, so it cannot
 * reach the network. It also gets its own worker key, and nothing routes public
 * traffic to that key, so it is unreachable except from this module.
 *
 * The one thing it can do is run module top-level code, which the server bundle
 * would run anyway the first time a request arrived. A schema file that throws
 * on import fails here instead of in production, which is the better order.
 */
import { TEMPLATE_MANIFEST } from "@sfab-lite/template";
import { bundleWithKernel } from "./compile-server.js";
import { kernelModules } from "./kernel-modules.js";
import {
  canonicalizeSnapshot,
  type SchemaSnapshot,
  type TableSpec,
} from "./schema-ddl.js";
import { probeEntrySource } from "./schema-probe-source.js";

const PROBE_ENTRY = "src/__sfab_schema_probe.ts";

/**
 * Distinguishes one compiled probe from another in the Worker Loader cache.
 *
 * Keyed on schema content rather than on a version id, because the probe runs
 * before a version exists at all — that is the point of it. Two apps whose schemas
 * are byte-identical can safely share a loaded probe: it reads no per-app state
 * and holds no bindings.
 */
async function schemaKey(source: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(source)
  );
  return Array.from(new Uint8Array(digest).slice(0, 8))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface ProbeResponse {
  ok: boolean;
  error?: string;
  tables?: TableSpec[];
}

export type ProbeResult =
  | { ok: true; snapshot: SchemaSnapshot; ms: number }
  | { ok: false; error: string; ms: number };

/**
 * The schema the app's code declares, or why we could not find out.
 *
 * A failure is never treated as "no tables" by the caller: an empty snapshot
 * diffed against a live database reports every existing table as dropped, so a
 * broken probe must refuse the deploy rather than describe it.
 */
export async function probeSchema(
  env: Env,
  sourceFiles: Record<string, string>
): Promise<ProbeResult> {
  const t0 = Date.now();
  const entry = TEMPLATE_MANIFEST.schema;
  const schemaSource = sourceFiles[entry];
  if (schemaSource == null) {
    return {
      ok: false,
      error: `schema probe: app has no ${entry}`,
      ms: Date.now() - t0,
    };
  }

  let bundle: string;
  try {
    const files = { ...sourceFiles };
    files[PROBE_ENTRY] = probeEntrySource(entry);
    bundle = (await bundleWithKernel(files, PROBE_ENTRY)).js;
  } catch (e) {
    return {
      ok: false,
      error: `schema probe: compile failed: ${e instanceof Error ? e.message : String(e)}`,
      ms: Date.now() - t0,
    };
  }

  try {
    const key = `schema-probe:${await schemaKey(schemaSource)}`;
    const worker = env.LOADER.get(key, () => ({
      compatibilityDate: "2026-07-23",
      compatibilityFlags: ["nodejs_compat"],
      mainModule: "index.js",
      modules: { ...kernelModules(), "index.js": bundle },
      // No bindings and no network. The probe reads code, not state.
      env: {},
      globalOutbound: null,
    }));
    const res = await worker
      .getEntrypoint()
      .fetch(new Request("https://schema-probe/"));
    const body = (await res.json().catch(() => null)) as ProbeResponse | null;
    if (!(body?.ok && body.tables)) {
      return {
        ok: false,
        error: body?.error ?? `schema probe: HTTP ${res.status}`,
        ms: Date.now() - t0,
      };
    }
    return {
      ok: true,
      snapshot: canonicalizeSnapshot({ tables: body.tables }),
      ms: Date.now() - t0,
    };
  } catch (e) {
    return {
      ok: false,
      error: `schema probe: ${e instanceof Error ? e.message : String(e)}`,
      ms: Date.now() - t0,
    };
  }
}
