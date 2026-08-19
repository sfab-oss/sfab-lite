/**
 * Ask an app's own code what schema it declares, via drizzle-kit generate.
 *
 * drizzle-kit's API needs the live table objects from `sqliteTable(...)`.
 * Those live in the frozen kernel, alongside the app, not in the factory.
 * Compile a tiny entry over the app's sources, load it through the same
 * Worker Loader that serves the app, and call generate there — `api.mjs` is
 * a sibling module so Vite never flattens it.
 *
 * The probe is strictly less privileged than serve: no `DB`, no auth secret,
 * no bindings, `globalOutbound: null`.
 */
import type { ManifestV0 } from "@sfab-lite/core";
import type { KitSnapshot } from "@sfab-lite/verbs/db";
import { callBundle } from "../forge/call-build.js";
import { kernelModules } from "../serve/kernel-modules.js";
import { drizzleKitLoaderModules } from "./drizzle-kit-modules.js";
import { probeEntrySource } from "./schema-probe-source.js";

const PROBE_ENTRY = "src/__sfab_schema_probe.ts";
const KIT_API_EXTERNAL = "./api.mjs";

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
  snapshot?: KitSnapshot;
  sql?: string[];
}

export type ProbeResult =
  | { ok: true; snapshot: KitSnapshot; sql: string[]; ms: number }
  | { ok: false; error: string; ms: number };

export async function probeSchema(
  env: Env,
  sourceFiles: Record<string, string>,
  manifest: ManifestV0,
  prev?: KitSnapshot
): Promise<ProbeResult> {
  const t0 = Date.now();
  const entry = manifest.schema;
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
    bundle = (await callBundle(env, files, PROBE_ENTRY, [KIT_API_EXTERNAL])).js;
  } catch (e) {
    return {
      ok: false,
      error: `schema probe: compile failed: ${e instanceof Error ? e.message : String(e)}`,
      ms: Date.now() - t0,
    };
  }

  const kitModules = drizzleKitLoaderModules();

  try {
    const key = `schema-probe:${await schemaKey(schemaSource)}`;
    const worker = env.LOADER.get(key, () => ({
      compatibilityDate: "2026-07-23",
      compatibilityFlags: ["nodejs_compat"],
      mainModule: "index.js",
      modules: {
        ...kernelModules(),
        ...kitModules,
        "index.js": bundle,
      },
      env: {},
      globalOutbound: null,
    }));
    const res = await worker.getEntrypoint().fetch(
      new Request("https://schema-probe/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prev: prev ?? null }),
      })
    );
    const body = (await res.json().catch(() => null)) as ProbeResponse | null;
    if (!(body?.ok && body.snapshot && Array.isArray(body.sql))) {
      return {
        ok: false,
        error: body?.error ?? `schema probe: HTTP ${res.status}`,
        ms: Date.now() - t0,
      };
    }
    return {
      ok: true,
      snapshot: body.snapshot,
      sql: body.sql,
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
