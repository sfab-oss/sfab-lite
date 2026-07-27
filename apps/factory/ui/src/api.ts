/** Wire types for `/admin/*` and `/api/config` — shapes match the worker. */

type AppStatus = "creating" | "ready" | "failed";

export interface AppRecord {
  id: string;
  organizationId: string;
  name: string;
  status: AppStatus;
  createAttemptId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthConfig {
  passwordAuth: boolean;
  githubAuth: boolean;
  /**
   * Whether the sign-up form may be offered. An allowlisted factory reports
   * `true` and rejects unlisted addresses on submit. Sign-in is unaffected.
   */
  signUpAvailable: boolean;
}

export interface AttemptRecord {
  id: string;
  kind: string;
  status: string;
  parentId: string | null;
  versionId: string | null;
  createdAt: number;
  updatedAt: number;
  payload: unknown;
}

export interface VersionSummary {
  id: string;
  parentId: string | null;
  createdAt: number;
  kernelVersion: string;
  serverBundleBytes: number;
  assetKeys: string[];
}

export class AuthRequiredError extends Error {
  constructor() {
    super("auth_required");
    this.name = "AuthRequiredError";
  }
}

async function readJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

async function errorMessage(res: Response, fallback: string): Promise<string> {
  const body = await readJson<{ error?: string }>(res).catch(() => ({
    error: undefined as string | undefined,
  }));
  return body.error ?? fallback;
}

export async function fetchAuthConfig(): Promise<AuthConfig> {
  const res = await fetch("/api/config");
  if (!res.ok) {
    throw new Error(`config failed (${res.status})`);
  }
  return readJson<AuthConfig>(res);
}

export async function listApps(): Promise<{
  organizationId: string;
  apps: AppRecord[];
}> {
  const res = await fetch("/admin/apps", { credentials: "include" });
  if (res.status === 401) {
    throw new AuthRequiredError();
  }
  if (!res.ok) {
    throw new Error(
      await errorMessage(res, `list apps failed (${res.status})`)
    );
  }
  const body = await readJson<{
    ok: true;
    organizationId: string;
    apps: AppRecord[];
  }>(res);
  return { organizationId: body.organizationId, apps: body.apps };
}

/**
 * Omit `name` and the server picks a placeholder. The console does that: it
 * knows what the app should *do*, from the prompt, which is not the same as
 * what it should be called.
 */
export async function createApp(name?: string): Promise<{
  appId: string;
  attemptId: string;
  name: string;
}> {
  const res = await fetch("/admin/apps", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(name ? { name } : {}),
  });
  if (res.status === 401) {
    throw new AuthRequiredError();
  }
  if (res.status !== 202) {
    throw new Error(await errorMessage(res, `create failed (${res.status})`));
  }
  const body = await readJson<{
    appId: string;
    attemptId: string;
    name: string;
  }>(res);
  return { appId: body.appId, attemptId: body.attemptId, name: body.name };
}

export async function renameApp(
  appId: string,
  name: string
): Promise<AppRecord> {
  const res = await fetch(`/admin/apps/${encodeURIComponent(appId)}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (res.status === 401) {
    throw new AuthRequiredError();
  }
  if (!res.ok) {
    throw new Error(await errorMessage(res, `rename failed (${res.status})`));
  }
  const body = await readJson<{ ok: true; app: AppRecord }>(res);
  return body.app;
}

export async function getApp(appId: string): Promise<AppRecord> {
  const res = await fetch(`/admin/apps/${encodeURIComponent(appId)}`, {
    credentials: "include",
  });
  if (res.status === 401) {
    throw new AuthRequiredError();
  }
  if (!res.ok) {
    throw new Error(await errorMessage(res, `get app failed (${res.status})`));
  }
  const body = await readJson<{ ok: true; app: AppRecord }>(res);
  return body.app;
}

/**
 * Delete an app and everything it owns. Irreversible — there is no trash.
 *
 * A 409 means a commit or the initial seed is still running; the app is
 * untouched and the same call works once it settles.
 */
export async function deleteApp(appId: string): Promise<void> {
  const res = await fetch(`/admin/apps/${encodeURIComponent(appId)}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (res.status === 401) {
    throw new AuthRequiredError();
  }
  if (!res.ok) {
    const detail = await errorMessage(res, `delete failed (${res.status})`);
    // The wire code is accurate and unreadable; the worker's own vocabulary
    // should not be what a person sees on a button they just pressed.
    throw new Error(
      detail === "attempt_in_flight"
        ? "a commit is still running — try again in a moment"
        : detail
    );
  }
}

export async function listVersions(appId: string): Promise<{
  liveVersionId: string | null;
  versions: VersionSummary[];
}> {
  const res = await fetch(`/admin/apps/${encodeURIComponent(appId)}/versions`, {
    credentials: "include",
  });
  if (res.status === 401) {
    throw new AuthRequiredError();
  }
  if (!res.ok) {
    throw new Error(
      await errorMessage(res, `list versions failed (${res.status})`)
    );
  }
  return readJson<{
    liveVersionId: string | null;
    versions: VersionSummary[];
  }>(res);
}

export async function getLiveSources(appId: string): Promise<{
  liveVersionId: string;
  sourceFiles: Record<string, string>;
}> {
  const res = await fetch(`/admin/apps/${encodeURIComponent(appId)}/live`, {
    credentials: "include",
  });
  if (res.status === 401) {
    throw new AuthRequiredError();
  }
  if (!res.ok) {
    throw new Error(
      await errorMessage(res, `get live sources failed (${res.status})`)
    );
  }
  const body = await readJson<{
    ok: true;
    liveVersionId: string;
    sourceFiles: Record<string, string>;
  }>(res);
  return {
    liveVersionId: body.liveVersionId,
    sourceFiles: body.sourceFiles,
  };
}

export async function getAttempt(
  appId: string,
  attemptId: string
): Promise<AttemptRecord> {
  const res = await fetch(
    `/admin/apps/${encodeURIComponent(appId)}/attempts/${encodeURIComponent(attemptId)}`,
    { credentials: "include" }
  );
  if (res.status === 401) {
    throw new AuthRequiredError();
  }
  if (!res.ok) {
    throw new Error(
      await errorMessage(res, `get attempt failed (${res.status})`)
    );
  }
  const body = await readJson<{ ok: true; attempt: AttemptRecord }>(res);
  return body.attempt;
}
