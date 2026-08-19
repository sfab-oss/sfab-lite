# ERP file routes (SPA + Hono)

Non-authoritative working note. Authoritative layout claims live in
`docs/architecture/APP-FORMAT.md` §2.

## What landed

The ERP seed uses TanStack **file-route grammar** (`createFileRoute` under
`src/routes/`) plus a committed `src/routeTree.gen.ts`. Still SPA + Hono —
no `@tanstack/react-start`, no Vite router plugin on the hosted compile.

`src/router.tsx` mounts the generated tree. Template-only `tsr generate`
(`@tanstack/router-cli` 1.129.0, matching kernel `@tanstack/react-router`)
lives on `@sfab-lite/starter-erp`. Hosted agents edit the route file and the
gen file together; the gen file is **not** host-readonly.

## Check classification

`clientPrefixesFromManifest` treats `/app/src/routeTree.gen.ts` as an exact
client path (sibling of `client.entry`).

## Drift

`pnpm check:route-tree` regenerates and fails if `routeTree.gen.ts` is dirty.
Wired next to the other seed gates.
