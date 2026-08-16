import type { build } from "@sfab-lite/verbs/build";
import type { OverlaidTree } from "@sfab-lite/verbs/format";
import type { AppBuild } from "../code-host/build-store.js";
import { toAppBuild } from "../code-host/build-store.js";
import { collectMigrations } from "../registry/app-migrations.js";

export function appBuildFromCompile(
  sha: string,
  tree: OverlaidTree,
  compiled: Awaited<ReturnType<typeof build>>
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
