/** Wire helpers for `/api/*` — shapes from `hc`. */

import type { InferResponseType } from "hono/client";
import { client } from "./lib/client";

type Ok<T> = Extract<T, { ok: true }>;

const protectedApi = client.protected;

export type AppRecord = Ok<
  InferResponseType<(typeof protectedApi.apps)["$get"], 200>
>["apps"][number];

export interface AuthConfig {
  passwordAuth: boolean;
  githubAuth: boolean;
  /**
   * Whether the sign-up form may be offered. An allowlisted factory reports
   * `true` and rejects unlisted addresses on submit. Sign-in is unaffected.
   */
  signUpAvailable: boolean;
}

export type AttemptRecord = Ok<
  InferResponseType<
    (typeof protectedApi.apps)[":appId"]["attempts"][":attemptId"]["$get"],
    200
  >
>["attempt"];

export type VersionSummary = InferResponseType<
  (typeof protectedApi.apps)[":appId"]["versions"]["$get"],
  200
>["versions"][number];

export class AuthRequiredError extends Error {
  constructor() {
    super("auth_required");
    this.name = "AuthRequiredError";
  }
}

interface HttpResult {
  status: number;
  ok: boolean;
  json: () => Promise<unknown>;
}

async function errorMessage(
  res: HttpResult,
  fallback: string
): Promise<string> {
  const body = (await res.json().catch(() => null)) as {
    error?: string;
  } | null;
  return body?.error ?? fallback;
}

function throwIfUnauthorized(res: HttpResult): void {
  if (res.status === 401) {
    throw new AuthRequiredError();
  }
}

export async function fetchAuthConfig(): Promise<AuthConfig> {
  const res = await client.config.$get();
  if (!res.ok) {
    throw new Error(`config failed (${res.status})`);
  }
  return res.json();
}

export interface McpConsentContext {
  user: { name: string; email: string };
  organizations: { id: string; name: string; slug: string }[];
}

/**
 * Who is signed in, and which organizations they may bind an MCP client to.
 * `null` means nobody is — the consent screen shows sign-in rather than an
 * error, because arriving here signed out is the normal first-time path.
 */
export async function fetchMcpConsentContext(): Promise<McpConsentContext | null> {
  const res = await client.mcp.consent.$get();
  if (res.status === 401) {
    return null;
  }
  if (!res.ok) {
    throw new Error(await errorMessage(res, `consent failed (${res.status})`));
  }
  return (await res.json()) as McpConsentContext;
}

/**
 * Answer the authorization request. Returns where to send the browser — the
 * client's redirect URI, carrying either a code or `access_denied`.
 *
 * `oauthQuery` is the address bar's query string verbatim: the provider signed
 * that exact string, so anything reassembled from parsed parameters fails the
 * signature check.
 */
export async function submitMcpConsent(input: {
  oauthQuery: string;
  organizationId: string;
  accept: boolean;
}): Promise<string> {
  const res = await client.mcp.consent.$post({
    json: {
      oauth_query: input.oauthQuery,
      organizationId: input.organizationId,
      accept: input.accept,
    },
  });
  if (!res.ok) {
    throw new Error(await errorMessage(res, `consent failed (${res.status})`));
  }
  const body = (await res.json()) as { url?: string };
  if (!body.url) {
    throw new Error("the authorization server returned no redirect");
  }
  return body.url;
}

export async function listApps(): Promise<{
  organizationId: string;
  apps: AppRecord[];
}> {
  const res = await protectedApi.apps.$get();
  throwIfUnauthorized(res);
  if (res.status !== 200) {
    throw new Error(
      await errorMessage(res, `list apps failed (${res.status})`)
    );
  }
  const body = await res.json();
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
  const res = await protectedApi.apps.$post({
    json: name ? { name } : {},
  });
  throwIfUnauthorized(res);
  if (res.status !== 202) {
    throw new Error(await errorMessage(res, `create failed (${res.status})`));
  }
  const body = await res.json();
  let nameOut = "";
  if (typeof body.name === "string") {
    nameOut = body.name;
  } else if (typeof name === "string") {
    nameOut = name;
  }
  return {
    appId: body.appId,
    attemptId: body.attemptId,
    name: nameOut,
  };
}

export async function renameApp(
  appId: string,
  name: string
): Promise<AppRecord> {
  const res = await protectedApi.apps[":appId"].$patch({
    param: { appId },
    json: { name },
  });
  throwIfUnauthorized(res);
  if (res.status !== 200) {
    throw new Error(await errorMessage(res, `rename failed (${res.status})`));
  }
  const body = await res.json();
  return body.app;
}

export async function getApp(appId: string): Promise<AppRecord> {
  const res = await protectedApi.apps[":appId"].$get({
    param: { appId },
  });
  throwIfUnauthorized(res);
  if (res.status !== 200) {
    throw new Error(await errorMessage(res, `get app failed (${res.status})`));
  }
  const body = await res.json();
  return body.app;
}

/**
 * Delete an app and everything it owns. Irreversible — there is no trash.
 *
 * A 409 means a commit or the initial seed is still running; the app is
 * untouched and the same call works once it settles.
 */
export async function deleteApp(appId: string): Promise<void> {
  const res = await protectedApi.apps[":appId"].$delete({
    param: { appId },
  });
  throwIfUnauthorized(res);
  if (!res.ok) {
    const detail = await errorMessage(res, `delete failed (${res.status})`);
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
  const res = await protectedApi.apps[":appId"].versions.$get({
    param: { appId },
  });
  throwIfUnauthorized(res);
  if (res.status !== 200) {
    throw new Error(
      await errorMessage(res, `list versions failed (${res.status})`)
    );
  }
  const body = await res.json();
  return {
    liveVersionId: body.liveVersionId,
    versions: body.versions,
  };
}

export async function getLiveSources(appId: string): Promise<{
  liveVersionId: string;
  sourceFiles: Record<string, string>;
}> {
  const res = await protectedApi.apps[":appId"].live.$get({
    param: { appId },
  });
  throwIfUnauthorized(res);
  if (res.status !== 200) {
    throw new Error(
      await errorMessage(res, `get live sources failed (${res.status})`)
    );
  }
  const body = await res.json();
  return {
    liveVersionId: body.liveVersionId,
    sourceFiles: body.sourceFiles,
  };
}

export async function getAttempt(
  appId: string,
  attemptId: string
): Promise<AttemptRecord> {
  const res = await protectedApi.apps[":appId"].attempts[":attemptId"].$get({
    param: { appId, attemptId },
  });
  throwIfUnauthorized(res);
  if (res.status !== 200) {
    throw new Error(
      await errorMessage(res, `get attempt failed (${res.status})`)
    );
  }
  const body = await res.json();
  return body.attempt;
}
