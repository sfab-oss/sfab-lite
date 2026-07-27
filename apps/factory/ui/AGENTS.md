# Factory console UI (`apps/factory/ui`)

## Tokens (canonical)

**Shadcn semantic tokens are canonical for all new factory UI** — primitives
under `src/components/ui`, the auth rebuild, and the chat graft.

Use Tailwind utilities (`bg-muted`, `text-muted-foreground`, `bg-primary`,
`text-primary`, `bg-accent`, `border-border`, …) or the matching CSS variables
(`--background`, `--foreground`, `--muted`, `--muted-foreground`, `--primary`,
`--accent`, `--destructive`, `--border`, …). Meanings match the platform
`@sfab/ui` / shadcn set:

| Token | Meaning |
| --- | --- |
| `--muted` | muted **surface** |
| `--muted-foreground` | muted **text** |
| `--accent` | subtle hover / secondary **surface** |
| `--accent-foreground` | text on that surface |
| `--primary` | primary action fill (ink here) |
| `--brand` | sfab rosa mexicano (not shadcn; focus ring; deliberate `text-brand` only) |

Do **not** use `var(--muted)` for text or `var(--accent)` for brand colour.
Do **not** reintroduce `--muted-bg` / `--accent-bg` collision shims.
Do **not** reintroduce `--ink` / `--line` / `--surface` / `--bg` / `--danger`.

Defined in [`src/styles.css`](src/styles.css).

## Verification kit

`/dev/ui` mounts every ported primitive. It is **DEV-only**: registered and
code-split only when `import.meta.env.DEV` is true, so production builds omit
the gallery (and streamdown) from the main chunk.

```bash
pnpm --filter @sfab-lite/factory dev:ui
# → http://localhost:5173/dev/ui
# → http://localhost:5173/dev/chat  (chat graft, DEV-only)
```

## Imports

```ts
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
```
