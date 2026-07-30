import TEMPLATE_SEED from "@sfab-lite/template/seed" with { type: "json" };
import {
  githubAuthEnabled,
  githubSecretsPresent,
  passwordAuthEnabled,
  signUpAllowlist,
  signUpOpen,
} from "@/lib/auth/policy";
import type { ProtectedReply } from "../../hono/reply.js";
import type { ProtectedCtx } from "../../server/routes.js";

/**
 * Ask a bound worker whether it holds the same `ADMIN_TOKEN` we do.
 *
 * `reachable: false` and `matchesCaller: false` are different diagnoses and
 * must not collapse into one: the first is a broken binding, the second a
 * mismatched secret, and only the second is the failure this probe exists to
 * catch. A throw here is the binding, not the token.
 */
async function probePeerToken(
  binding: Fetcher | undefined,
  token: string | undefined
): Promise<{
  reachable: boolean;
  configured: boolean;
  matchesCaller: boolean;
}> {
  const absent = { reachable: false, configured: false, matchesCaller: false };
  if (!binding) {
    return absent;
  }
  try {
    const res = await binding.fetch("https://peer/health", {
      headers: token ? { "X-Admin-Token": token } : {},
    });
    if (!res.ok) {
      return absent;
    }
    const body = (await res.json()) as {
      adminToken?: { configured?: boolean; matchesCaller?: boolean };
    };
    return {
      reachable: true,
      configured: Boolean(body.adminToken?.configured),
      matchesCaller: Boolean(body.adminToken?.matchesCaller),
    };
  } catch {
    return absent;
  }
}

/**
 * Health, including the one deploy prerequisite nothing else states out loud:
 * factory, check and lint must hold a byte-identical `ADMIN_TOKEN`.
 *
 * Before this, a mismatch first surfaced mid-commit as `lint_failed` with
 * `lintHttp: 401` — an error that names the lint worker when the fault is a
 * secret the factory presented. `adminToken.agree` answers it directly, and
 * answers it *before* anyone tries to commit.
 */
export async function handleHealth(
  rc: ProtectedCtx
): Promise<ProtectedReply<unknown>> {
  const token = rc.env.ADMIN_TOKEN;
  const [check, lint] = await Promise.all([
    probePeerToken(rc.env.CHECK, token),
    probePeerToken(rc.env.LINT, token),
  ]);
  return {
    status: 200,
    body: {
      ok: true as const,
      service: "sfab-lite-factory",
      phase: "s3d",
      bindings: {
        check: Boolean(rc.env.CHECK),
        lint: Boolean(rc.env.LINT),
        loader: Boolean(rc.env.LOADER),
      },
      adminToken: {
        configured: Boolean(token),
        check,
        lint,
        agree: Boolean(token) && check.matchesCaller && lint.matchesCaller,
      },
      seedFiles: Object.keys(TEMPLATE_SEED.sourceFiles).length,
      seedMigrations: TEMPLATE_SEED.migrations.length,
      passwordAuth: passwordAuthEnabled(rc.env),
      githubAuth: githubAuthEnabled(rc.env),
      githubSecrets: githubSecretsPresent(rc.env),
      signUpOpen: signUpOpen(rc.env),
      signUpAllowlisted: signUpAllowlist(rc.env).size,
    },
  };
}
