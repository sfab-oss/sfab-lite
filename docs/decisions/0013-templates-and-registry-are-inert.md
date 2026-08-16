# ADR-0013: Templates and the registry are inert; the harness decides when to upgrade

**Status:** Accepted
**Date:** 2026-08-16
**Deciders:** Alwurts

## Context

The framework's extension mechanism is copied source
([ADR-0009](0009-registry-shadcn-format-served-lite-namespace.md)): a
recipe fix reaches only the apps that `add` it after the fix. The
Milestone 1 close-out named this "source-upgrade problem" the biggest
unsolved item for long-lived apps, and listed fleet upgrade (plan /
dry-run / promote / rollback), an unmanaged-fraction metric, and
per-file `pinned` / `seeded` / `owned` modes as future *framework*
mechanisms. The original research framing even allowed security fixes
to be forced.

Owner ruling 2026-08-16: that framing is wrong. In an ordinary
development environment dependencies do not update themselves; the
developer decides when. Same here.

## Decision

The framework provides three inert things and never decides *when*:

- **Templates** — starters: a complete app tree you start from (today
  `starters/erp`).
- **The registry** — versioned code you pull onto a template: UI
  recipes and domain modules such as a tax module. Overwrite `add`,
  per-file provenance, no auto-update, ever
  ([`../../registry/README.md`](../../registry/README.md)).
- **The verbs** ([ADR-0012](0012-framework-owns-the-verbs.md)).

Templates are layered by registry items: a base template, then modules
on top.

**The harness decides** when to `add`, when to move an app to a newer
recipe version, for one app or a fleet, and how — a PR per app; the
diff is the review surface. Fleet operations, dry-run / rollback, the
unmanaged-fraction metric, and per-file modes are **harness features
built on provenance facts** the registry already exposes (recipe
version plus per-file hash versus the catalog — the `npm outdated`
analogue), not framework mechanisms. Nothing is ever forced.

Two follow-ups this decision creates (named, not built here):

1. **Multiple templates.** `starters/<name>` each with its own
   manifest; create takes a template id. That is harness plumbing;
   today create bakes exactly one seed.
2. **Cross-cutting wiring for domain modules.** A module needs a
   route mounted, a nav entry, a generated migration. Copying source
   cannot wire those, and [ADR-0008](0008-declarative-manifest-no-app-plugin-system.md)
   rules out hooks, so **`add` copies, the agent wires, the PR shows
   both**. Recipes must state their expected wiring in the item's
   description, and the agent dogfood session must include one `add`
   to see whether an agent actually does it.

## Consequences

### Positive

- One clear owner for "when".
- The framework stays small ([ADR-0011](0011-eject-rule.md) spirit:
  a bound, not a feature).

### Negative

- A fleet without a harness policy accumulates drift silently.

### Mitigations

- The unmanaged-fraction metric, on the harness side, is how that
  drift becomes visible.

## Related

- [ADR-0005](0005-app-loop-mimics-an-ordinary-repo.md)
- [ADR-0008](0008-declarative-manifest-no-app-plugin-system.md)
- [ADR-0009](0009-registry-shadcn-format-served-lite-namespace.md)
- [ADR-0011](0011-eject-rule.md)
- [ADR-0012](0012-framework-owns-the-verbs.md)
- [`../../registry/README.md`](../../registry/README.md)
