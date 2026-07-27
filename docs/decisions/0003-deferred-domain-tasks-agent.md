# ADR-0003: Defer domain, tasks-lite scope, and agent substrate

**Status:** Accepted
**Date:** 2026-07-24
**Deciders:** Alwurts

## Context

Bootstrap needed a clean monorepo before UI, auth, or agent work. Several
product questions are real but block later slices, not the first loop.

## Decision

Defer until the named check-in:

| Topic | Decide when |
| --- | --- |
| Domain (auth / hosting) | Before factory UI, auth, and organizations |
| Tasks-lite scope | When tasks-lite work starts |
| Agent substrate | When agent work starts |

Factory UI/UX is also not settled at bootstrap — sharpen when that work
starts. Do not invent interim auth-less admin panels or speculative agent
harnesses.

## Consequences

### Positive

- Early work stays focused on template + runtime port.
- Product questions get a real sharpening pass with a working loop.

### Negative

- Factory UI / auth / organizations cannot start until domain is decided.

### Mitigations

- Call out the blockers explicitly when handing off between slices.

## Related

- [ADR-0001](./0001-edge-native-lite-architecture.md)
