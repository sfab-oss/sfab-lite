# ADR-0003: Defer domain, tasks-lite scope, and agent substrate

**Status:** Accepted
**Date:** 2026-07-24
**Deciders:** Alwurts

## Context

S0 needed a clean monorepo before UI, auth, or agent work. Several product
questions are real but block later stages, not bootstrap.

## Decision

Defer until the named check-in:

| Topic | Decide at |
| --- | --- |
| Domain (auth / hosting) | Before S3 |
| Tasks-lite scope | S3 check-in |
| Agent substrate | S4 check-in |

Lite factory UI/UX is also not settled at S0 — sharpen when that work starts
(S3+). Do not invent interim auth-less admin panels or speculative agent
harnesses.

## Consequences

### Positive

- S1–S2 stay focused on template + runtime port.
- Product questions get a real sharpening pass with a working loop.

### Negative

- S3 cannot start until domain is decided.

### Mitigations

- Call out the blockers explicitly in stage handoffs.

## Related

- Packet plan stages S3–S4 (agent-workspace `active/sfab-lite/PLAN.md`)
