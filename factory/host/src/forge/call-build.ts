import type { BuildRequest, BundleRequest } from "@sfab-lite/core";
import type { build, bundleWithKernel } from "@sfab-lite/verbs/build";
import type { OverlaidTree } from "@sfab-lite/verbs/format";

export function auxServiceHeaders(env: Env): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json" };
  if (env.ADMIN_TOKEN) {
    h["X-Admin-Token"] = env.ADMIN_TOKEN;
  }
  return h;
}

export type AppCompileResult = Awaited<ReturnType<typeof build>>;

export type BundleWithKernelResult = Awaited<
  ReturnType<typeof bundleWithKernel>
>;

interface BuildWorkerFailure {
  ok?: boolean;
  error?: string;
}

export async function callBuild(
  env: Env,
  tree: OverlaidTree
): Promise<AppCompileResult> {
  const payload: BuildRequest = {
    files: tree.files,
    manifest: tree.manifest,
  };
  const res = await env.BUILD.fetch(
    new Request("https://build-worker/build", {
      method: "POST",
      headers: auxServiceHeaders(env),
      body: JSON.stringify(payload),
    })
  );
  const body = (await res.json().catch(() => null)) as
    | (AppCompileResult & { ok?: boolean })
    | BuildWorkerFailure
    | null;
  if (!(res.ok && body && body.ok === true && "compiled" in body)) {
    throw new Error(
      body && "error" in body && typeof body.error === "string"
        ? body.error
        : `build worker HTTP ${res.status}`
    );
  }
  return body;
}

export async function callBundle(
  env: Env,
  files: Record<string, string>,
  entryPoint: string,
  extraExternals: string[] = []
): Promise<BundleWithKernelResult> {
  const payload: BundleRequest = { files, entryPoint, extraExternals };
  const res = await env.BUILD.fetch(
    new Request("https://build-worker/bundle", {
      method: "POST",
      headers: auxServiceHeaders(env),
      body: JSON.stringify(payload),
    })
  );
  const body = (await res.json().catch(() => null)) as
    | (BundleWithKernelResult & { ok?: boolean })
    | BuildWorkerFailure
    | null;
  if (!(res.ok && body && body.ok === true && "js" in body)) {
    throw new Error(
      body && "error" in body && typeof body.error === "string"
        ? body.error
        : `build worker HTTP ${res.status}`
    );
  }
  return body;
}
