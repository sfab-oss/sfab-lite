import type { WorkspaceFsLike } from "@cloudflare/shell";
import { appStub } from "../commit.js";

const SEEDED_KEY = "workspaceSeededFromLive";

/** `app_<ulid>:<threadId>` — app ids never contain `:`. */
export function parseThreadName(name: string): {
  appId: string;
  threadId: string;
} {
  const sep = name.indexOf(":");
  if (sep <= 0 || sep === name.length - 1) {
    throw new Error(
      `AppThread name must be appId:threadId, got ${JSON.stringify(name)}`
    );
  }
  return {
    appId: name.slice(0, sep),
    threadId: name.slice(sep + 1),
  };
}

function toWorkspacePath(sourcePath: string): string {
  return sourcePath.startsWith("/") ? sourcePath : `/${sourcePath}`;
}

/**
 * Scratch checkout from the app's live version. Once-only per DO instance so
 * a wake does not clobber in-thread edits; a new thread always starts empty
 * and seeds fresh from whatever is live then.
 */
export async function seedWorkspaceFromLive(
  env: Env,
  storage: DurableObjectStorage,
  workspace: WorkspaceFsLike,
  appId: string
): Promise<{ liveVersionId: string; fileCount: number }> {
  const already = await storage.get<string>(SEEDED_KEY);
  if (already) {
    return { liveVersionId: already, fileCount: -1 };
  }

  const live = await appStub(env, appId).getLive();
  const files = live.version?.sourceFiles;
  if (!(live.liveVersionId && files)) {
    throw new Error(
      `AppThread: app ${appId} has no live version with source_files`
    );
  }

  const entries = Object.entries(files);
  for (const [path, content] of entries) {
    await workspace.writeFile(toWorkspacePath(path), content);
  }

  await storage.put(SEEDED_KEY, live.liveVersionId);
  return { liveVersionId: live.liveVersionId, fileCount: entries.length };
}
