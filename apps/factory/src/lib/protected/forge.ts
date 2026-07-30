import {
  createPullRequest,
  getCheckRun,
  getPullRequestByNumber,
  listCheckRuns,
  listPullRequests,
  mergePullRequest,
  prDiffSummary,
  readTreeAtRef,
  rerunCheckRun,
  wireCheckRun,
  wirePr,
} from "../../forge/forge.js";
import { protectedError } from "../../hono/reply.js";
import type { CreatePrBody } from "../../hono/schemas.js";
import type { AppCtx } from "../../server/routes.js";

export async function handleListPrs(rc: AppCtx) {
  const prs = await listPullRequests(rc.env, rc.appId);
  return {
    status: 200 as const,
    body: {
      ok: true as const,
      appId: rc.appId,
      prs: prs.map(wirePr),
    },
  };
}

export async function handleCreatePr(rc: AppCtx, body: CreatePrBody) {
  const result = await createPullRequest(rc.env, rc.appId, {
    title: body.title,
    body: body.body,
    headBranch: body.headBranch,
    baseBranch: body.baseBranch,
  });
  if (!result.ok) {
    let status: 400 | 404 | 409 = 400;
    if (result.error === "open_pr_exists") {
      status = 409;
    } else if (
      result.error === "head_branch_missing" ||
      result.error === "base_branch_missing"
    ) {
      status = 404;
    }
    return protectedError(result.error, status);
  }
  return {
    status: 201 as const,
    body: {
      ok: true as const,
      appId: rc.appId,
      pr: wirePr(result.pr),
      checkRun: wireCheckRun(result.checkRun),
    },
  };
}

export async function handleGetPr(rc: AppCtx, number: number) {
  const pr = await getPullRequestByNumber(rc.env, rc.appId, number);
  if (!pr) {
    return protectedError("pr_not_found", 404);
  }
  const checks = await listCheckRuns(rc.env, rc.appId, {
    prId: pr.id,
    limit: 30,
  });
  return {
    status: 200 as const,
    body: {
      ok: true as const,
      appId: rc.appId,
      pr: wirePr(pr),
      checks: checks.map(wireCheckRun),
    },
  };
}

export async function handleMergePr(rc: AppCtx, number: number) {
  const result = await mergePullRequest(rc.env, rc.appId, number);
  if (!result.ok) {
    if (result.error === "cd_failed") {
      return {
        status: 500 as const,
        body: {
          ok: false as const,
          error: result.error,
          detail: result.detail,
        },
      };
    }
    let status: 400 | 404 | 409 = 400;
    if (result.error === "pr_not_found") {
      status = 404;
    } else if (
      result.error === "checks_pending" ||
      result.error === "checks_failed" ||
      result.error === "head_moved" ||
      result.error === "pr_not_open"
    ) {
      status = 409;
    }
    return protectedError(result.error, status);
  }
  return {
    status: 200 as const,
    body: {
      ok: true as const,
      appId: rc.appId,
      pr: wirePr(result.pr),
      liveSha: result.liveSha,
    },
  };
}

export async function handleListPrChecks(rc: AppCtx, number: number) {
  const pr = await getPullRequestByNumber(rc.env, rc.appId, number);
  if (!pr) {
    return protectedError("pr_not_found", 404);
  }
  const checks = await listCheckRuns(rc.env, rc.appId, {
    prId: pr.id,
    limit: 50,
  });
  return {
    status: 200 as const,
    body: {
      ok: true as const,
      appId: rc.appId,
      prNumber: number,
      checks: checks.map(wireCheckRun),
    },
  };
}

export async function handlePrDiff(rc: AppCtx, number: number) {
  const diff = await prDiffSummary(rc.env, rc.appId, number);
  if (!diff.ok) {
    return protectedError(diff.error, 404);
  }
  return {
    status: 200 as const,
    body: {
      ok: true as const,
      appId: rc.appId,
      prNumber: number,
      baseSha: diff.baseSha,
      headSha: diff.headSha,
      changedPaths: diff.changedPaths,
      files: diff.files,
    },
  };
}

export async function handleGetTree(rc: AppCtx, ref: string) {
  const tree = await readTreeAtRef(rc.env, rc.appId, ref);
  if (!tree.ok) {
    return protectedError(tree.error, 404);
  }
  return {
    status: 200 as const,
    body: {
      ok: true as const,
      appId: rc.appId,
      ref: tree.ref,
      sha: tree.sha,
      branches: tree.branches,
      sourceFiles: tree.sourceFiles,
    },
  };
}

export async function handleListRuns(
  rc: AppCtx,
  opts: { sha?: string; limit?: number }
) {
  const runs = await listCheckRuns(rc.env, rc.appId, {
    sha: opts.sha,
    limit: opts.limit ?? 50,
  });
  return {
    status: 200 as const,
    body: {
      ok: true as const,
      appId: rc.appId,
      runs: runs.map(wireCheckRun),
    },
  };
}

export async function handleGetRun(rc: AppCtx, runId: string) {
  const run = await getCheckRun(rc.env, rc.appId, runId);
  if (!run) {
    return protectedError("run_not_found", 404);
  }
  return {
    status: 200 as const,
    body: {
      ok: true as const,
      appId: rc.appId,
      run: wireCheckRun(run),
    },
  };
}

export async function handleRerun(rc: AppCtx, runId: string) {
  const run = await rerunCheckRun(rc.env, rc.appId, runId);
  if (!run) {
    return protectedError("run_not_found", 404);
  }
  return {
    status: 200 as const,
    body: {
      ok: true as const,
      appId: rc.appId,
      run: wireCheckRun(run),
    },
  };
}
