import type { WorkspaceFsLike } from "@cloudflare/shell";
import { createR2CodeHost } from "../r2-code-host.js";

const CLONED_KEY = "workspaceClonedFromCodeHost";

export type SeedWorkspaceResult =
  | { sha: string | null }
  | { skipped: true; reason: string };

/**
 * Clone the app repo into AppAgent's shared workspace once, when empty.
 * Never auto-re-clone — from then on the workspace is the working copy.
 */
export async function seedWorkspaceFromCodeHost(
  env: Env,
  storage: DurableObjectStorage,
  workspace: WorkspaceFsLike,
  appId: string
): Promise<SeedWorkspaceResult> {
  const already = await storage.get<string>(CLONED_KEY);
  if (already) {
    return { sha: already === "empty" ? null : already };
  }

  try {
    const host = createR2CodeHost(env);
    await host.ensureRepo(appId);
    const { sha } = await host.cloneTo(
      appId,
      workspace as unknown as import("../code-host.js").GitWorkFs,
      "/"
    );
    await storage.put(CLONED_KEY, sha ?? "empty");
    return { sha };
  } catch (e) {
    return {
      skipped: true,
      reason: `clone failed for ${appId}: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
