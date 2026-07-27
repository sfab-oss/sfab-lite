import type { WorkspaceFsLike } from "@cloudflare/shell";
import { appStub } from "../commit.js";

const SEEDED_KEY = "workspaceSeededFromLive";

function toWorkspacePath(sourcePath: string): string {
  return sourcePath.startsWith("/") ? sourcePath : `/${sourcePath}`;
}

export type SeedWorkspaceResult =
  | { liveVersionId: string }
  | { skipped: true; reason: string };

/**
 * Seed AppAgent's shared workspace from the app's live version once, when
 * empty. Never auto-re-seed — from then on the workspace is the working copy.
 * Missing live source fails locally (skipped) so onStart still completes and
 * the agent stays reachable; callers surface the reason.
 */
export async function seedWorkspaceFromLive(
  env: Env,
  storage: DurableObjectStorage,
  workspace: WorkspaceFsLike,
  appId: string
): Promise<SeedWorkspaceResult> {
  const already = await storage.get<string>(SEEDED_KEY);
  if (already) {
    return { liveVersionId: already };
  }

  const live = await appStub(env, appId).getLive();
  const files = live.version?.sourceFiles;
  if (!(live.liveVersionId && files)) {
    return {
      skipped: true,
      reason: `app ${appId} has no live version with source_files`,
    };
  }

  for (const [path, content] of Object.entries(files)) {
    await workspace.writeFile(toWorkspacePath(path), content);
  }

  await storage.put(SEEDED_KEY, live.liveVersionId);
  return { liveVersionId: live.liveVersionId };
}
