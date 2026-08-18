# 2026-08-17 — Milestone 1 addendum (post-structure wave)

Non-authoritative (see [`README.md`](README.md)). Sibling of
[`2026-08-15-milestone-1-closeout.md`](2026-08-15-milestone-1-closeout.md).
Records what landed after that note, how we checked it, and what the
owner dropped vs kept. No market language.

**Status:** Milestone 1 exit criteria were already met on 2026-08-15.
The structure wave through #164 is closed. Validation is
**smoke-tested**, not owner product-feel. Next product work is
Milestone 2 design (talk first). No extra implementation PRs in this
chapter.

Main at close: `f58a78a` (#164).

## What landed after the 2026-08-15 close-out

Verbs, adapters, drizzle-kit generation, a dedicated build worker,
honesty/stdlib/Hono host routing, scale n=40, then factory `git show`
(#164) after validation hit a missing shell verb. Agent design (#144)
stays closed unmerged.

Live create on current main still reaches `ready` (typical ~42 s in
the n=3 sample). Copy-out of the ERP seed still `pnpm install` +
`vite build`. A hosted one-edit preview showed the new heading at
130 s.

## Owner-ratified parked list (2026-08-17)

**Dropped** (not a project; reopen only if the trigger fires):

- Hono as the HTTP router **on the lint worker** (not “lint Hono”).
  Lint upload is already ~95% of the 10 MB cap (Biome WASM). Reopen
  after a Biome bump that shrinks gzip **and** those shells grow more
  routes.
- Full virtual git. Add a verb when a hosted run hits a missing one.
- Sign-up form with an allowlist as a bug. `signUpAvailable` means a
  registration path exists; unlisted addresses 403 on submit, as
  documented.
- Preview iframe 401 vs document 302 as a build. Implemented and
  unit-tested. Regression only if sign-in appears inside the iframe.
- Hunting the CI `check-memory` first-attempt flake. Rerun is the
  move unless reruns fail too.
- A continuing “use the library” campaign. Oxide / merging the four
  workers stay rejected or ADR-blocked.
- Fleet upgrade until there is a fleet of long-lived apps.

**Kept** (named later, not this chapter):

- Factory-agent “always ship via PR” prompt → factory-agent design
  session (not a drive-by prompt edit).
- In-app agent (closed #144) → its own later milestone, not
  Milestone 2.
- Second starter → Milestone 2 interview. Do not pre-build.

Standing rules that stay (not tickets): add a git verb when we hit
one; if `check-memory` fails once on a PR branch, rerun.

## Does not imply

- Owner product-feel sign-off.
- That the hosted agent stops after a one-line edit (it still tries
  to open a PR; that is the kept prompt-policy session).
- That a second starter or fleet upgrade is scheduled.
