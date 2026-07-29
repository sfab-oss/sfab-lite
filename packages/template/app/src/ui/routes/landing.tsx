import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { sessionQueryOptions } from "../lib/session";

/**
 * Public canvas for demos and first paint. No session required — the live
 * iframe can show a real UI before anyone signs in.
 */
export function LandingPage() {
  const session = useQuery(sessionQueryOptions);
  const enterTo =
    session.data?.authenticated && !session.data.needsOnboarding
      ? "/overview"
      : "/sign-in";

  return (
    <main className="landing">
      <div aria-hidden className="landing-glow" />
      <div aria-hidden className="landing-grid" />

      <div className="landing-copy">
        <p className="landing-brand">sfab-lite</p>
        <h1 className="landing-headline">Trade with clarity</h1>
        <p className="landing-lede">
          Parties, catalog, and invoices in one place — built to ship, not to
          demo.
        </p>
        <div className="landing-actions">
          <Link className="landing-cta" to={enterTo}>
            Enter app
          </Link>
        </div>
      </div>
    </main>
  );
}
