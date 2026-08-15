import type { AppBuild } from "../code-host/build-store.js";
import { toAppBuild } from "../code-host/build-store.js";
import type { compileAll } from "../compile/compile-all.js";
import type { OverlaidTree } from "../format/overlay-format-files.js";
import { collectMigrations } from "../registry/app-migrations.js";

export function appBuildFromCompile(
  sha: string,
  tree: OverlaidTree,
  compiled: Awaited<ReturnType<typeof compileAll>>
): AppBuild {
  return toAppBuild({
    sha,
    serverBundle: compiled.compiled.serverBundle,
    assets: compiled.assets,
    serverSurfaceHash: compiled.compiled.serverSurfaceHash,
    runtime: compiled.compiled.kernelVersion,
    manifest: tree.manifest,
    migrations: collectMigrations(tree.files).map(
      (migration) => `${migration.id}.sql`
    ),
  });
}
