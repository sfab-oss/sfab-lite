import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import type * as React from "react";
import { authClient } from "../lib/auth-client";
import { sessionQueryOptions } from "../lib/session";
import { Avatar, AvatarFallback } from "./avatar";
import { Badge } from "./badge";
import { Button } from "./button";
import { Separator } from "./separator";

const WHITESPACE = /\s+/;

const NAV = [
  { to: "/documents", label: "Documents" },
  { to: "/entities", label: "Parties" },
  { to: "/catalog", label: "Catalog" },
] as const;

function initials(name: string | undefined, email: string | undefined): string {
  const source = name?.trim() || email?.trim() || "?";
  const parts = source.split(WHITESPACE).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

/**
 * Chrome shared by every signed-in page: who you are, which organization you
 * are in, and the way between the three resources.
 */
export function AppShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const session = useQuery(sessionQueryOptions);

  const userName = session.data?.user?.name;
  const userEmail = session.data?.user?.email;
  const orgName = session.data?.organization?.name ?? "Organization";

  async function onSignOut() {
    await authClient.signOut();
    queryClient.clear();
    await navigate({ to: "/sign-in" });
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-8">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <h1 className="font-medium text-xl">{title}</h1>
            <Badge variant="secondary">{orgName}</Badge>
          </div>
          <p className="text-muted-foreground text-sm">{userEmail}</p>
        </div>
        <div className="flex items-center gap-3">
          <Avatar size="sm">
            <AvatarFallback>{initials(userName, userEmail)}</AvatarFallback>
          </Avatar>
          <Button onClick={onSignOut} type="button" variant="outline">
            Sign out
          </Button>
        </div>
      </header>

      <nav className="flex items-center gap-1">
        {NAV.map((item) => (
          <Link
            activeProps={{ className: "bg-muted text-foreground" }}
            className="rounded-md px-3 py-1.5 font-medium text-muted-foreground text-sm hover:text-foreground"
            key={item.to}
            to={item.to}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <Separator />

      {children}
    </div>
  );
}
