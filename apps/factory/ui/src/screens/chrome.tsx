import type { ReactNode } from "react";
import { authClient } from "../auth-client";
import { Link, useRouter } from "../router";

export function ConsoleChrome({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const { navigate } = useRouter();
  const { data: session } = authClient.useSession();

  async function onSignOut() {
    await authClient.signOut();
    navigate({ name: "sign-in" }, true);
  }

  return (
    <div className="mx-auto min-h-screen max-w-3xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-[var(--line)] border-b pb-4">
        <div>
          <p className="m-0 font-medium text-[var(--muted-foreground)] text-xs uppercase tracking-wide">
            <Link
              to={{ name: "chat" }}
              className="text-[var(--muted-foreground)] no-underline"
            >
              sfab-lite
            </Link>
            <span className="mx-1.5 text-[var(--line)]">/</span>
            <Link
              to={{ name: "apps" }}
              className="text-[var(--muted-foreground)] no-underline"
            >
              Apps
            </Link>
          </p>
          <h1 className="m-0 mt-1 font-semibold text-2xl tracking-tight">
            {title}
          </h1>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {session?.user?.email ? (
            <span className="text-[var(--muted-foreground)]">
              {session.user.email}
            </span>
          ) : null}
          <button
            type="button"
            onClick={onSignOut}
            className="border border-[var(--line)] bg-transparent px-2 py-1 text-[var(--ink)]"
          >
            Sign out
          </button>
        </div>
      </header>
      {children}
    </div>
  );
}
