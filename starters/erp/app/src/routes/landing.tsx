import { Link } from "@tanstack/react-router";
import { useSession } from "../hooks/use-session";

export function LandingPage() {
  const session = useSession();
  const enterTo =
    session.data?.authenticated && !session.data.needsOnboarding
      ? "/overview"
      : "/sign-in";

  return (
    <main className="relative flex min-h-screen items-end overflow-hidden bg-[oklch(0.18_0.02_230)] px-[clamp(2rem,6vw,4.5rem)] py-[clamp(2rem,6vw,4.5rem)] text-[oklch(0.92_0.02_85)]">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-[20%] -right-[10%] h-[min(70vw,42rem)] w-[min(70vw,42rem)] animate-landing-drift rounded-full bg-[radial-gradient(circle_at_40%_40%,color-mix(in_oklch,oklch(0.55_0.08_210)_55%,transparent),transparent_62%),radial-gradient(circle_at_70%_60%,color-mix(in_oklch,oklch(0.72_0.12_55)_35%,transparent),transparent_55%)]"
      />
      <div
        aria-hidden
        className="mask-[radial-gradient(ellipse_at_30%_80%,black_20%,transparent_70%)] pointer-events-none absolute inset-0 animate-landing-grid-in bg-[linear-gradient(color-mix(in_oklch,oklch(0.92_0.02_85)_6%,transparent)_1px,transparent_1px),linear-gradient(90deg,color-mix(in_oklch,oklch(0.92_0.02_85)_6%,transparent)_1px,transparent_1px)] bg-size-[4rem_4rem]"
      />

      <div className="relative z-10 flex max-w-xl flex-col gap-4">
        <p className="m-0 animate-landing-rise font-semibold text-[clamp(2.75rem,8vw,5rem)] leading-[0.95] tracking-[-0.04em]">
          sfab-lite
        </p>
        <h1 className="m-0 animate-landing-rise font-medium text-[clamp(1.25rem,3vw,1.75rem)] leading-tight tracking-[-0.02em] [animation-delay:0.12s]">
          Parties and a running balance
        </h1>
        <p className="m-0 max-w-md animate-landing-rise text-[color-mix(in_oklch,oklch(0.92_0.02_85)_72%,transparent)] text-base leading-normal [animation-delay:0.22s]">
          A generic ERP starter: who you trade with, what they owe, and what
          they have paid.
        </p>
        <div className="mt-3 animate-landing-rise [animation-delay:0.32s]">
          <Link
            className="inline-flex h-10 items-center justify-center rounded-lg bg-[oklch(0.92_0.02_85)] px-4 font-medium text-[oklch(0.18_0.02_230)] text-sm no-underline transition-[transform,background-color] duration-150 ease-out hover:-translate-y-px hover:bg-[color-mix(in_oklch,oklch(0.92_0.02_85)_88%,white)]"
            to={enterTo}
          >
            Enter app
          </Link>
        </div>
      </div>
    </main>
  );
}
