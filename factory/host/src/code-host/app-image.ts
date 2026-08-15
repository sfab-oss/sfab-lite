import { validateManifest } from "@sfab-lite/core";
import type { AppBuild } from "../code-host/build-store.js";
import { toAppBuild } from "../code-host/build-store.js";
import type { compileAll } from "../compile/compile-all.js";
import { collectMigrations } from "../registry/app-migrations.js";

export function appBuildFromCompile(
  sha: string,
  sourceFiles: Record<string, string>,
  compiled: Awaited<ReturnType<typeof compileAll>>
): AppBuild {
  const raw = sourceFiles["manifest.json"];
  if (raw == null || raw === "") {
    throw new Error("pack: missing manifest.json");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error("pack: manifest.json is not JSON", { cause: err });
  }
  const validated = validateManifest(parsed);
  if (!validated.ok) {
    throw new Error(
      `pack: invalid manifest.json: ${validated.issues
        .map((i) => `${i.path}: ${i.message}`)
        .join("; ")}`
    );
  }
  return toAppBuild({
    sha,
    serverBundle: compiled.compiled.serverBundle,
    assets: compiled.assets,
    serverSurfaceHash: compiled.compiled.serverSurfaceHash,
    runtime: compiled.compiled.kernelVersion,
    manifest: validated.manifest,
    migrations: collectMigrations(sourceFiles).map(
      (migration) => `${migration.id}.sql`
    ),
  });
}
