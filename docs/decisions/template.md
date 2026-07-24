# ADR template & guidelines

Architecture Decision Records capture **opinions and their reversals** — not
every choice. Before writing one, apply the bar.

## The significance bar (write an ADR only if all three hold)

1. **Costly or disruptive to reverse** — shapes structure, dependency graph,
   or a cross-surface contract.
2. **Cross-cutting** — affects many packages/layers, not a local detail.
3. **Chosen among real alternatives** — a genuine fork worth recording.

If it fails any of these, it is **not** an ADR (use a note, a guide, or just
the code).

## Lifecycle

- Append-mostly: prefer a new ADR that supersedes an old one.
- When superseded, set **Status** and link both ways.

---

# ADR-NNNN: \<Title\>

**Status:** Proposed | Accepted | Superseded by ADR-XXXX | Deprecated
**Date:** YYYY-MM-DD
**Deciders:** \<names\>

## Context

What forced the decision? Constraints and facts — short. Link related ADRs /
notes / exploration evidence rather than restating them.

## Decision

Lead with the answer as a present-tense rule.

## Consequences

### Positive

### Negative

### Mitigations

## Implementation notes

(Optional) Pointers to start work — not a full design.

## Related
