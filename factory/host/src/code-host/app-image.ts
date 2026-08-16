import type { OverlaidTree } from "@sfab-lite/verbs/format";
import type { AppBuild } from "../code-host/build-store.js";
import { toAppBuild } from "../code-host/build-store.js";
import type { AppCompileResult } from "../forge/call-build.js";
import { collectMigrations } from "../registry/app-migrations.js";

export function appBuildFromCompile(
  sha: string,
  tree: OverlaidTree,
  compiled: AppCompileResult
): AppBuild {
  return toAppBuild({
    sha,
    serverBundle: compiled.compiled.serverBundle,
    assets: compiled.assets,
    serverSurfaceHash: compiled.compiled.serverSurfaceHash,
    runtime: compiled.compiled.kernelVersion,
    manifest: tree.manifest,
    migrations: collectMigrations(tree.files, tree.manifest).map(
      (migration) => `${migration.id}.sql`
    ),
  });
}
