const NO_ALLOWLIST: ReadonlySet<string> = new Set();

const RE_ALLOWLIST_SEPARATOR = /[\s,]+/;
const RE_LOCAL_ORIGIN = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/;
const RE_PORT = /^\d{2,5}$/;

/**
 * Fail-safe: only the exact string `"true"` enables password auth. Unset,
 * empty, or any other value stays off — a missing toggle must not open a
 * sign-in surface we did not mean to expose.
 */
export function passwordAuthEnabled(env: Env): boolean {
  return env.PASSWORD_AUTH === "true";
}

/**
 * Whether anyone may create a **new** factory account.
 *
 * Same fail-safe rule as `passwordAuthEnabled`, and for a sharper reason: this
 * deploy is reachable by URL, so an unset toggle would leave the front door
 * open to the whole internet. Only the exact string `"true"` opens it.
 *
 * This gates *registration*, not authentication — better-auth's `disableSignUp`
 * refuses to create a user and leaves sign-in untouched, so existing accounts
 * keep working when it flips off. Turning it on is therefore reversible and
 * costs nothing to leave closed.
 */
export function signUpOpen(env: Env): boolean {
  return env.SIGNUP_OPEN === "true";
}

/**
 * Lowercased because better-auth normalises the address before it reaches the
 * hook, so an entry differing only in case would never match and would read as
 * "the allowlist is broken" rather than "the entry is wrong".
 */
function allowlistRaw(env: Env): string {
  return env.SIGNUP_ALLOWLIST?.trim() ?? "";
}

/**
 * The addresses permitted to register, or an empty set when none is configured.
 */
export function signUpAllowlist(env: Env): ReadonlySet<string> {
  const raw = allowlistRaw(env);
  if (!raw) {
    return NO_ALLOWLIST;
  }
  return new Set(
    raw
      .split(RE_ALLOWLIST_SEPARATOR)
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean)
  );
}

/**
 * Whether a registration path exists at all — sign-up open to everyone, or an
 * allowlist naming who may take it.
 */
export function signUpAvailable(env: Env): boolean {
  if (allowlistRaw(env)) {
    return signUpAllowlist(env).size > 0;
  }
  return signUpOpen(env);
}

/**
 * One definition of "this secret is set": non-blank after a trim.
 */
function trimmedSecret(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function githubCredentials(
  env: Env
): { clientId: string; clientSecret: string } | null {
  const clientId = trimmedSecret(env.GITHUB_CLIENT_ID);
  const clientSecret = trimmedSecret(env.GITHUB_CLIENT_SECRET);
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/**
 * Presence of each GitHub secret, separately — for health detail that must
 * distinguish half-configured from fully off.
 */
export function githubSecretsPresent(env: Env): {
  clientId: boolean;
  clientSecret: boolean;
} {
  return {
    clientId: trimmedSecret(env.GITHUB_CLIENT_ID) !== null,
    clientSecret: trimmedSecret(env.GITHUB_CLIENT_SECRET) !== null,
  };
}

/** GitHub sign-in is on exactly when both credentials are present. */
export function githubAuthEnabled(env: Env): boolean {
  return githubCredentials(env) !== null;
}

export function githubCredentialsForAuth(
  env: Env
): { clientId: string; clientSecret: string } | null {
  return githubCredentials(env);
}

function viteDevOrigins(baseURL: string, uiPort: string | undefined): string[] {
  if (!RE_LOCAL_ORIGIN.test(baseURL)) {
    return [];
  }
  const port = uiPort?.trim();
  const resolved = port && RE_PORT.test(port) ? port : "5173";
  return [`http://127.0.0.1:${resolved}`, `http://localhost:${resolved}`];
}

/**
 * The origins a browser request to this factory may legitimately come from.
 *
 * Exported because better-auth's own CSRF check covers `/api/auth/*` and
 * nothing else — the consent POST is our route, so it has to apply the same
 * list rather than invent a second, laxer one.
 */
export function factoryTrustedOrigins(env: Env, baseURL: string): string[] {
  return [baseURL, ...viteDevOrigins(baseURL, env.UI_PORT)];
}
