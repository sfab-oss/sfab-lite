# 2026-09-02 — Artifacts probe (AC-1)

**Status:** done (AC-1 of ALW-862)
**Not:** a factory prod bind. Factory `wrangler.jsonc` was not changed.

Non-authoritative working note. Product nouns stay **code host / repo /
build / forge**. Cloudflare Artifacts is the vendor git product.

## How

Throwaway Worker lived in the manager workspace
`scratch/alw-862-artifacts-probe/` (gitignored there; **not** ignored
by this repo). Do not copy that Worker into `sfab-lite`.
Wrangler **4.113.0**, OAuth login with `artifacts (write)`. Binding:

```jsonc
{ "binding": "ARTIFACTS", "namespace": "sfab-lite-apps", "remote": true }
```

`wrangler dev` (port 8799): Worker local, Artifacts **remote**. No
`wrangler deploy` of the probe Worker. `POST /repos` called
`env.ARTIFACTS.create("probe-2026-09-02")`. Stock `git` then
push / clone / fetch with
`git -c http.extraHeader="Authorization: Bearer …"` (token never in
`.git/config`).

`compatibility_date` `"2026-09-02"` failed: this Wrangler's workerd
supports through `"2026-07-28"`. Probe used `"2026-07-23"` (factory's
date).

## What create() returns

Flat object, not a nested repo handle:

`id`, `name`, `displayName`, `description`, `defaultBranch`, `remote`,
`token`.

- **remote:** `https://<accountId>.artifacts.cloudflare.net/git/sfab-lite-apps/<repo>`
- **token:** prefix `art_v2_`. The token **string** includes
  `?expires=` (Unix), not the remote URL. Docs samples still show
  `art_v1_`.
- Namespace `sfab-lite-apps` did not need a separate create call; first
  repo created it.

## Git

| Step | Result |
| --- | --- |
| `git push -u origin main` | pass |
| `git clone` into a second dir | pass (tip `probe commit`) |
| `git fetch origin` in the pusher | pass |
| Token in `remote.origin.url` | no |

## Still unknown (adapter)

- isomorphic-git HTTP from a **Worker isolate** to
  `*.artifacts.cloudflare.net` (CPU, pack size, TLS). Local stock git
  is not that proof.
- `wrangler types` `Artifacts` shape on factory's Wrangler after adding
  the binding (treat generated types as source of truth).
- Whether factory `wrangler dev` needs `remote = true` the same way.

## Does not imply

No `ARTIFACTS` binding on `sfab-lite-factory`. No wipe. No F-004 fix.
Leave `probe-2026-09-02` in `sfab-lite-apps` until the adapter lands
or we delete it on purpose.
