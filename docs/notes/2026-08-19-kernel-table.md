# 2026-08-19 — Kernel pin: @tanstack/react-table

Catalog modules (`manifest.modules`) are still unimplemented, so list-page
table libs stay in the kernel until that slot exists. Same class as
react-query / RHF: one shared client chunk, not a per-app npm dep.

## Pins

- `@tanstack/react-table@8.21.3` → client `tanstack-table.js` (**23.6 KiB** gzip)

`KERNEL_VERSION` stays `0.4.0`.

Host gzip after pin: **4.00 MiB / 41.9%** (was 3.97 MiB / 41.7%).

Check resolves `@tanstack/table-core` at `build/lib/index.d.ts` so
`export *` from `@tanstack/react-table` can see `ColumnDef`. Local starter
`tsc` uses node_modules and hid the miss.

## Follow-on: DIY theme (no next-themes)

FOUC-safe `sfab-theme` boot script in `formatIndexHtml`, `lite/theme-toggle@0.1.0`
(`src/lib/theme.ts` + sun/moon cycle in the shell header), Appearance card
(Light / Dark / System) on base/erp/heavy settings. No new kernel pin —
host gzip should not move.

## Recipe

`lite/data-table@0.1.0` — thin `DataTable` + `DataTableColumnHeader` over
`lite/table`, kernel `@tanstack/react-table` (`useReactTable`, `flexRender`,
sorting), radix caret icons. Seeded into ERP + heavy (not base).

## Starter usage

ERP/Heavy `routes/_app/parties/index.tsx` uses the data-table (name / kind /
balance). Other tables left on `lite/table`.

## Follow-on: ResourceTable-level client chrome

`lite/data-table@0.1.1` adds client `getFilteredRowModel` (search Input)
and `getPaginationRowModel` (prev/next). ERP/Heavy parties, balances, and
party ledger use it. Filter state is internal — no unused controlled
props. No URL pagination — Lite APIs are not paginated.
