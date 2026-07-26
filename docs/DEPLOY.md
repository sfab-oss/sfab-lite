# Deploying sfab-lite

Three workers, deployed independently, that only work as a set:
`sfab-lite-factory` (host + console), `sfab-lite-check`, `sfab-lite-lint`.

Merging to `main` deploys the platform. Treat a merge as a deploy gate.

## The prerequisite that bites

**`ADMIN_TOKEN` must be byte-identical in all three workers.**

The factory presents it over its service bindings; check and lint compare it
against their own. There is no negotiation and no shared store — three copies
of one string, set by hand, three times.

A mismatch does not announce itself. It surfaces in the middle of a commit as:

```
lint_failed   lintHttp: 401
```

which names the lint worker when the fault is the token the *factory* sent.
This cost a real debugging detour on the first production deploy, which is why
`/admin/health` now answers the question directly:

```bash
curl -s -H "X-Admin-Token: $ADMIN_TOKEN" https://<factory>/admin/health | jq .adminToken
```

```json
{
  "configured": true,
  "check": { "reachable": true, "configured": true, "matchesCaller": true },
  "lint":  { "reachable": true, "configured": true, "matchesCaller": true },
  "agree": true
}
```

`agree: false` means stop and fix the secret before committing anything.
Read the two sub-objects rather than only the flag — they separate diagnoses
that look identical from the outside:

| Symptom | Meaning |
| --- | --- |
| `reachable: false` | the service binding is wrong or the peer is not deployed |
| `configured: false` | that worker has no `ADMIN_TOKEN` at all |
| `matchesCaller: false` | both have one and they differ — the classic case |

An unset `ADMIN_TOKEN` **denies**. All three workers 401 without a matching
credential; a missing secret never grants access. (Check and lint used to
fail *open* here, which meant a forgotten secret quietly exposed `/check` —
an expensive endpoint — to anyone who found the worker's URL.)

## Secrets, per worker

| Secret | factory | check | lint | Notes |
| --- | :-: | :-: | :-: | --- |
| `ADMIN_TOKEN` | ● | ● | ● | **identical in all three** |
| `BETTER_AUTH_SECRET` | ● | | | the factory's own sign-in, ≥32 chars |
| `APP_BETTER_AUTH_SECRET` | ● | | | injected into every sub-app; without it no app serves |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | ● | | | both or neither — the provider registers only when both are non-blank |
| `PASSWORD_AUTH` | ● | | | `"true"` enables email+password; default off |
| `SIGNUP_OPEN` | ● | | | `"true"` allows **new accounts**; default off |

```bash
wrangler secret put ADMIN_TOKEN --name sfab-lite-factory
wrangler secret put ADMIN_TOKEN --name sfab-lite-check
wrangler secret put ADMIN_TOKEN --name sfab-lite-lint
```

Beware trailing newlines: a here-doc or a copied line readily stores one, and
the GitHub credentials are trimmed before use precisely because a
whitespace-only value is truthy but cannot complete a token exchange.
`ADMIN_TOKEN` is compared raw — a stray newline in one of the three is exactly
the mismatch above.

## Registration is closed by default

`SIGNUP_OPEN` unset means **nobody can create an account**, including the first
one. A fresh deploy therefore needs it set to `"true"` long enough to create the
accounts that should exist, then unset.

It gates registration only. Turning it off does not sign anyone out and does
not disable sign-in — better-auth's `disableSignUp` refuses user creation and
leaves authentication alone. Leaving it off is the intended production state,
and `/api/config` reports it so the console hides the sign-up form rather than
offering a button that cannot succeed.

The two paths fail differently, which matters when debugging:

| Path | Result when closed |
| --- | --- |
| password sign-up | `400` `EMAIL_PASSWORD_SIGN_UP_DISABLED` |
| GitHub, unknown user | redirect to the error URL with `error=signup_disabled` |
| either, existing user | signs in normally |

The password row and the sign-in behaviour were observed against a running
factory; the GitHub row is read from better-auth 1.6.19's `callback.mjs` and
has not been exercised, because it needs real credentials.

## Checklist

1. Create the R2 bucket once (first deploy that includes the binding):
   `wrangler r2 bucket create sfab-lite-kernel`
2. Upload the current kernel's client chunks (idempotent — no-ops when the
   version manifest already exists):
   `pnpm upload-kernel-r2 -- --remote`
3. `wrangler deploy` all three workers.
4. Set the secrets above. `ADMIN_TOKEN` three times, same value.
5. `curl .../admin/health` and confirm `adminToken.agree` is `true`.
6. Confirm `passwordAuth` / `githubAuth` / `githubSecrets` describe what you
   intended — `githubSecrets` reports the two separately because exactly one
   set is the plausible mistake and is otherwise indistinguishable from
   "GitHub off on purpose".
7. Create an app and let it reach `ready`. That exercises check, lint, the
   loader, and D1 in one pass; nothing shorter proves the set is wired.

Upload **before** deploy so a freshly bumped `KERNEL_VERSION` is already in
R2 when the new Worker starts serving — older apps keep resolving their
pinned `/kernel/<old>/…` import maps. Re-running the upload for an unchanged
version exits 0 without rewriting; a version bump uploads only the new key
prefix. Do not pass `--remote` from a laptop unless you mean to touch the
production bucket.

**Anything memory-related must be verified here, not locally** — local workerd
applies no memory limit at all, so `wrangler dev` cannot observe an OOM. Use
`wrangler tail <worker> --format json` and count `exceededMemory`. See
[`engineering/making-it-fit.md`](engineering/making-it-fit.md).
