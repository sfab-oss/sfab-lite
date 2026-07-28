# Deploying sfab-lite

Three workers, deployed independently, that only work as a set:
`sfab-lite-factory` (host + console), `sfab-lite-check`, `sfab-lite-lint`.

Merging to `main` deploys the platform. Treat a merge as a deploy gate.

## One origin

The factory is reachable at exactly one hostname, `lite.sfab.dev`, as a
Cloudflare custom domain. `workers_dev` is off, and turning it back on would be
a mistake rather than a convenience.

Nothing configures that origin. better-auth's `baseURL`, the OAuth issuer, the
RFC 8707 resource identifier, and the `__SFAB_PUBLIC_BASE__` handed to every
served app are all derived from the origin of the request being handled — so a
second reachable hostname is a second identity. Sessions established on one do
not carry to the other, and an access token minted with one hostname's audience
401s against the other with nothing in the response explaining why.

`check` and `lint` have no public hostname at all — `workers_dev` is off there
too. The factory is their only caller and reaches them over service bindings,
which dispatch worker-to-worker and never involve a hostname.

That is a deliberate narrowing, not tidiness. While they were on workers.dev,
`/check` and `/lint` failed closed on a missing `ADMIN_TOKEN` but `/health`
answered anyone who found the URL, and check's `/health` enumerates the entire
types VFS: every dependency and version the build environment carries. The
diagnostic still exists — the factory's `/admin/health` aggregates both over the
service bindings, which is the documented way to read it.

The cost is that neither worker can be curled directly any more. If you need to,
turn the subdomain back on for the length of the debugging session rather than
leaving it on.

### The domain is dashboard state, on purpose

`apps/factory/wrangler.jsonc` has **no `routes` key**, and adding one would be a
regression. A Worker custom domain is not a DNS record you point somewhere —
there is no origin address — it is an attachment binding hostname to Worker,
and creating it writes the DNS record as a side effect. Declaring it in
wrangler would therefore require the CI deploy token to hold zone-level **DNS
Edit** forever, widening a credential that runs on every merge in order to buy
a setup step performed once.

So the domain is attached by hand instead: **Workers & Pages → the worker →
Settings → Domains & Routes → Add → Custom domain**. This is the mode
Cloudflare documents — no `routes` key, `workers_dev` off, routing managed from
the dashboard. Wrangler leaves an unlisted domain alone; only an explicit
`routes: []` clears one.

The cost is that the hostname is not in the repo and no gate checks it. That is
what this section is for.

Attach the domain **before** the deploy that turns `workers_dev` off, or the
worker is briefly reachable at no hostname at all.

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
| `SIGNUP_OPEN` | ● | | | `"true"` allows **new accounts** from anyone; default off |
| `SIGNUP_ALLOWLIST` | ● | | | addresses that may register, comma/space separated; only ever restricts |

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

With neither `SIGNUP_OPEN` nor `SIGNUP_ALLOWLIST` set, **nobody can create an
account**, including the first one.

**Prefer `SIGNUP_ALLOWLIST` to open a fresh deploy.** Naming the addresses that
may register lets the accounts that should exist get created without ever
opening registration to whoever has the URL:

```bash
wrangler secret put SIGNUP_ALLOWLIST --name sfab-lite-factory   # you@example.com, teammate@example.com
```

The alternative — flipping `SIGNUP_OPEN=true`, registering, then unsetting it —
leaves a window where anyone with the URL can take an account, and the window
stays open if anything interrupts the sequence. The allowlist has no such
window, so it is also safe to leave configured.

The two never combine into an open door: the allowlist only ever *restricts*,
so `SIGNUP_OPEN=true` beside one leaves the allowlist in force rather than
lifting it. That holds even when the list is malformed — a value that is set
but parses to no addresses (a stray comma, a botched paste) means *nobody*
rather than falling back to `SIGNUP_OPEN`.

Both gate registration only. Turning either off does not sign anyone out and
does not disable sign-in — better-auth's `disableSignUp` refuses user creation
and leaves authentication alone. `/api/config` reports `signUpAvailable` so the
console hides the sign-up form rather than offering a button that cannot
succeed; with an allowlist the form renders and an unlisted address is refused
on submit with `SIGNUP_NOT_ALLOWLISTED`.

The two paths fail differently, which matters when debugging:

| Path | Result when closed |
| --- | --- |
| password sign-up | `400` `EMAIL_PASSWORD_SIGN_UP_DISABLED` |
| GitHub, unknown user | redirect to the error URL with `error=signup_disabled` |
| either, existing user | signs in normally |
| password sign-up, unlisted address under an allowlist | `403` `SIGNUP_NOT_ALLOWLISTED` |
| GitHub, unlisted address under an allowlist | redirect to the error URL; better-auth's OAuth path catches the error and mangles the message rather than passing the `403` through |

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
