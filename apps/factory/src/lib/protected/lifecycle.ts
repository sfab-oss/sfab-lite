import { callCheck, checkPasses } from "../../cd.js";
import { type ProtectedReply, protectedError } from "../../hono/reply.js";
import type { CheckBody, CommitBody, RevertBody } from "../../hono/schemas.js";
import type { AppCtx } from "../../routes.js";

/**
 * Typecheck posted source overlays. Commit/revert version APIs are removed —
 * ship via feature branch → PR → merge (bash git + virtual gh).
 */
export async function handleCheck(
  rc: AppCtx,
  body: CheckBody
): Promise<ProtectedReply<unknown>> {
  const { appId } = rc;
  const files: Record<string, string> = {};
  for (const [path, content] of Object.entries(body.files ?? {})) {
    if (content != null) {
      files[path] = content;
    }
  }
  if (Object.keys(files).length === 0) {
    return protectedError("no_files", 400);
  }
  const check = await callCheck(rc.env, appId, files, body.forceCold !== false);
  const pass = checkPasses(check.body);
  return {
    status: 200,
    body: {
      ok: check.http < 500 && Boolean(check.body?.ok),
      appId,
      wallMs: check.wallMs,
      publishGate: pass,
      check: check.body,
    },
  };
}

export function handleCommit(
  _rc: AppCtx,
  _body: CommitBody
): Promise<ProtectedReply<unknown>> {
  return Promise.resolve({
    status: 410,
    body: { ok: false as const, error: "commit_removed_use_pr_merge" },
  });
}

export function handleRevert(
  _rc: AppCtx,
  _body: RevertBody
): Promise<ProtectedReply<unknown>> {
  return Promise.resolve({
    status: 410,
    body: { ok: false as const, error: "revert_removed" },
  });
}
