import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { useSession } from "../../hooks/use-session";
import { authClient } from "../../lib/auth-client";
import { Button } from "../ui/button";

const NAV = [
  { to: "/overview", label: "Overview" },
  { to: "/parties", label: "Parties" },
  { to: "/balances", label: "Open balances" },
  { to: "/settings", label: "Settings" },
] as const;

export function AppNav() {
  const session = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [signingOut, setSigningOut] = useState(false);
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const orgName = session.data?.organization?.name ?? "sfab-lite";

  async function signOut() {
    if (signingOut) {
      return;
    }
    setSigningOut(true);
    try {
      await authClient.signOut();
    } finally {
      queryClient.clear();
      await navigate({ to: "/sign-in" });
    }
  }

  return (
    <nav className="flex h-12 items-center gap-2 border-b px-4">
      <span className="truncate font-medium text-sm">{orgName}</span>
      <div className="ml-4 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {NAV.map((item) => {
          const active =
            pathname === item.to || pathname.startsWith(`${item.to}/`);
          return (
            <Link key={item.to} to={item.to}>
              <Button
                size="sm"
                type="button"
                variant={active ? "secondary" : "ghost"}
              >
                {item.label}
              </Button>
            </Link>
          );
        })}
      </div>
      <Button
        disabled={signingOut}
        onClick={signOut}
        size="sm"
        type="button"
        variant="ghost"
      >
        {signingOut ? "Signing out…" : "Sign out"}
      </Button>
    </nav>
  );
}
