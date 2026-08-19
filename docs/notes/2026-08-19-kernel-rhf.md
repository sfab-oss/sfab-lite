# 2026-08-19 — Kernel pin: react-hook-form

Catalog modules (`manifest.modules`) are still unimplemented, so small
every-form client libs stay in the kernel until that slot exists. RHF is
the same class as `@tanstack/react-query` (~20 KiB gzip). PDF/Excel and
`@tanstack/react-table` wait; they are too large (or need modules) for this
line.

## Pins

- `react-hook-form@7.81.0` → client `rhf.js` (**20.3 KiB** gzip)
- `@hookform/resolvers@5.4.0` `/zod` → `hookform-resolvers-zod.js` (**1.6 KiB** gzip)
- Client `zod.js` (**76.9 KiB** gzip) so client-tree forms can `import { z }` /
  `zodResolver` (zod was previously server-import-map only; server still
  serves its own chunk)

`KERNEL_VERSION` stays `0.4.0`.

Host gzip after pin: **3.97 MiB / 41.7%** (was 3.87 MiB / 40.6%).

## Recipe

`lite/form@0.1.0` — shadcn FormField/FormItem helpers. **Retired from the
live catalog** (2026-08-19): screens use `Controller` + `Field` +
`FieldError`, matching sfab-starter. The `0.1.0` tree stays hashed in
`published.json` (immutable). Do not `apps_add lite/form`.

`lite/field@0.1.1` — same layout as 0.1.0 plus `FieldError` so SPA forms can
match sfab-starter (`Controller` + `fieldState` + `FieldError`).

## Starter usage

Every starter form uses `useForm` + `zodResolver` + `Controller` +
`FieldError`: sign-in, sign-up, onboarding, settings org-name, ERP/Heavy
`party-form` and `ledger-dialog`.
