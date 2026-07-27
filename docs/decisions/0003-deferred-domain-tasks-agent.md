# ADR-0003: Defer domain, tasks-lite scope, and agent substrate

**Status:** Accepted
**Date:** 2026-07-24
**Deciders:** Alwurts

## Context

Bootstrap needed a clean monorepo before UI, auth, or agent work. Several
scope questions were real but blocked later slices, not the first loop. This
ADR records that sequencing choice. It is not a roadmap and not a commitment
to build anything listed here.

## Decision

Defer until the named check-in (as of bootstrap):

| Topic | Decide when |
| --- | --- |
| Domain (auth / hosting) | Before factory UI, auth, and organizations |
| Tasks-lite scope | When tasks-lite work starts |
| Agent substrate | When agent work starts |

Factory UI/UX was also unsettled at bootstrap — sharpen when that work
starts. Do not invent interim auth-less admin panels or speculative agent
harnesses ahead of the loop that needs them.

## Consequences

### Positive

- Early work stayed focused on template + runtime port.
- Scope questions got a real pass only when a working loop needed them.

### Negative

- At bootstrap, factory UI / auth / organizations could not start until
  domain was decided.

### Mitigations

- Call out the blockers explicitly when handing off between slices.
- Treat this ADR as recorded context for *why* some surfaces were absent
  early — not as a backlog of product features to ship.

## Related

- [ADR-0001](./0001-edge-native-lite-architecture.md)
