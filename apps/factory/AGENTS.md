# Factory console UI (`apps/factory`)

## Tokens (canonical)

**Shadcn semantic tokens are canonical for all new factory UI** — primitives
in `@sfab-lite/ui`, the auth rebuild, and the chat graft.

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

Defined in `@sfab-lite/ui/globals.css` (imported from [`src/styles.css`](src/styles.css)).

## Verification kit

`/dev/ui` mounts every ported primitive. It is **DEV-only**: registered and
code-split only when `import.meta.env.DEV` is true, so production builds omit
the gallery (and streamdown) from the main chunk.

```bash
pnpm --filter @sfab-lite/factory dev
# → http://localhost:8790/dev/ui
# → http://localhost:8790/dev/chat  (chat graft, DEV-only)
```

## Imports

```ts
import { Button } from "@sfab-lite/ui/components/shadcn/button";
import { LogoDots } from "@sfab-lite/ui/components/icons/logo-dots";
import { cn } from "@sfab-lite/ui/lib/utils";
```
