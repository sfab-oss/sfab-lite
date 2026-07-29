import type { SVGProps } from "react";

const OUTER = [
  { cx: 127.5, cy: 257.5 },
  { cx: 380.5, cy: 93.5 },
  { cx: 648.5, cy: 455.5 },
  { cx: 380.5, cy: 659.5 },
  { cx: 127.5, cy: 498.5 },
] as const;
const CENTER = { cx: 380.5, cy: 376.5 } as const;
const R = 74;

type Variant = "scan" | "pulse";

export function AnimatedLogo({
  variant = "scan",
  accent = "var(--brand)",
  ...props
}: SVGProps<SVGSVGElement> & { variant?: Variant; accent?: string }) {
  const scan = variant === "scan";
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
          opacity={scan ? 1 : 0.32}
          r={R}
        />
      ))}
      <circle cx={CENTER.cx} cy={CENTER.cy} fill={accent} r={R} />
    </svg>
  );
}
