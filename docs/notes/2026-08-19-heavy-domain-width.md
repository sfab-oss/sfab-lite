# 2026-08-19 — Heavy domain-width: Items + Invoices

Non-authoritative. Packet: `feat/heavy-domain-width` on Heavy after #171.

## What landed

First org-scoped AR slice on `@sfab-lite/starter-heavy` only (not base/ERP):

- `item` — catalog row (`name`, optional `sku`, `unitPriceCents`)
- `invoice` + `invoice_line` — header (`partyId`, `status` draft|sent|paid,
  optional `memo`) and lines (`itemId` restrict, positive `quantity`,
  snapshotted `unitPriceCents`)

No auto-post to the ledger. Party delete also 409s when invoices exist;
item delete 409s when lines reference it. Nav: Items and Invoices after
Parties, before Open balances. Gallery untouched.

Migration: `starters/heavy/app/migrations/0003_ar.sql` (tip kit snapshot
`0003_snapshot.json`).

## Seed size

| | `starters/heavy/generated/seed.json` bytes |
| --- | ---: |
| previous (gallery heavy) | 398 262 |
| after this increment | 466 314 |

Hosted check-isolate / create-alarm probe is the manager's next step — this
note does not claim a wall.

## Walls

Not measured here (no prod deploy / `wrangler … --remote`).
