import { useMemo } from "react";
import {
  agentSigilGrid,
  SIGIL_CENTER,
  SIGIL_DOT_R,
  SIGIL_STOPS,
} from "@/lib/agent-sigil";

/**
 * Generative agent identity — a dot-matrix "sigil" derived purely from an
 * agent's id (the `contractors` table's `ctr_…` id). Sibling of `LogoDots`: the
 * same dot language, seeded per-agent.
 *
 * Lit dots render in `currentColor`, so the mark follows the surrounding text
 * color in both themes. The center node is always the "spark" — like the logo's
 * central dot — and carries `accent` (the brand accent by default). Pass
 * `grid` to render the unlit cells as a faint field (the "machined-plate" read).
 *
 * Size it the way the rest of the icon family is sized — via `className`
 * (`h-9 w-9`) or `style`, not a bespoke prop. The intrinsic 24×24 is just a
 * default any of those overrides.
 *
 * The generator lives in `@sfab/ui/lib/agent-sigil` and is pure/headless, so the
 * exact same grid can be painted to SVG/PNG in a Worker for email, OG cards, or
 * per-agent favicons — derive from the id, never store.
 *
 * Accent: defaults to `var(--brand)`. Consumers must define `--brand` (as the
 * docs app does) or pass `accent` explicitly (e.g. `accent="#e4007c"` or
 * `accent="currentColor"` for a monochrome rendering).
 */
export function AgentSigil({
  id,
  accent = "var(--brand)",
  grid = false,
  className,
  ...props
}: React.SVGProps<SVGSVGElement> & {
  id: string;
  accent?: string;
  /** Render the unlit cells as a faint grid (the "machined-plate" read). */
  grid?: boolean;
}) {
  const cells = useMemo(() => agentSigilGrid(id), [id]);
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height={24}
      viewBox="0 0 24 24"
      width={24}
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <title>{`Agent ${id}`}</title>
      {cells.flatMap((row, r) =>
        row.map((lit, c) => {
          const isSpark = r === SIGIL_CENTER && c === SIGIL_CENTER;
          if (!(lit || grid)) {
            return null;
          }
          let fill = "currentColor";
          if (isSpark) {
            fill = accent;
          } else if (!lit) {
            fill = "color-mix(in srgb, currentColor 14%, transparent)";
          }
          return (
            <circle
              cx={SIGIL_STOPS[c]}
              cy={SIGIL_STOPS[r]}
              fill={fill}
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed 5×5 matrix
              key={`${r}-${c}`}
              r={SIGIL_DOT_R}
            />
          );
        })
      )}
    </svg>
  );
}
