# Working notes

In-flight, **non-authoritative** working docs: planning trails, investigation
logs, design scratch.

1. **Date-first naming.** `YYYY-MM-DD[-slug].md`.
2. **One experiment per file.** Do not append a second measurement onto an
   existing note. Link siblings. The slug names the bet
   (`zone-check-memory`, `eject-copy-out`, `entities-only-check`, …).
3. **Non-authoritative.** If a note disagrees with `docs/decisions/`,
   `docs/architecture/`, or the code, the authoritative source wins.
4. **Graduation is a move, not a copy.** Promote into architecture/ADRs and
   delete the note. A one-line pointer in
   [`../engineering/making-it-fit.md`](../engineering/making-it-fit.md) is
   the catalogue; the note keeps the raw trail.
5. **Deletion is success.** Empty `docs/notes/` is healthy.

Packet directories are not the archive.

## Experiment note shape

Enough that a later session can re-run without the chat:

```markdown
# YYYY-MM-DD — <short name>

**Status:** <in progress | local done | adopted | not adopted | blocked>
**Hypothesis:** …

## How to re-run
(exact commands)

## What we ran
host, SHA, raw output (paste the JSON / logs)

## Verdict
adopt / reject / defer — one paragraph

## Does not imply
what this number is not allowed to justify

## Follow-ups
```
