import type { SVGProps } from "react";

/**
 * SFab dot-matrix mark.
 *
 * Derived from the platform logo (`apps/platform/public/logo.svg`) by collapsing
 * it into the dot-matrix language: the five outer circle nodes become uniform
 * dots, the connecting lines are dropped, and the central gear is replaced by a
 * single dot at the logo's center (where the cog sat).
 *
 * Dots render FILLED (at header sizes the original 30/771 stroke would vanish) in
 * `currentColor`, so the mark follows the surrounding text color in both themes.
 * Pass `accent` to light the central node — the one "spark" at the heart of the
 * factory.
 */

/** Uniform outer nodes — positions verbatim from the source SVG's <circle>s. */
const OUTER = [
  { cx: 127.5, cy: 257.5 },
  { cx: 380.5, cy: 93.5 },
  { cx: 648.5, cy: 455.5 },
  { cx: 380.5, cy: 659.5 },
  { cx: 127.5, cy: 498.5 },
] as const;

/** Every outer dot shares this radius. */
const OUTER_R = 74;
/** The central node (where the gear was), at the logo's center. */
const CENTER = { cx: 380.5, cy: 376.5 } as const;
const CENTER_R = 74;

export function LogoDots({
  accent,
  ...props
}: SVGProps<SVGSVGElement> & {
  /** Color for the central node (omit to keep the mark monochrome). */
  accent?: string;
}) {
  return (
    <svg
      fill="none"
      role="img"
      viewBox="0 0 771 771"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <title>SFab</title>
      {OUTER.map((node) => (
        <circle
          cx={node.cx}
          cy={node.cy}
          fill="currentColor"
          key={`${node.cx}-${node.cy}`}
          r={OUTER_R}
        />
      ))}
      <circle
        cx={CENTER.cx}
        cy={CENTER.cy}
        fill={accent ?? "currentColor"}
        r={CENTER_R}
      />
    </svg>
  );
}
