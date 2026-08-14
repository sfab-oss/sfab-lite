import type { ReactNode } from "react";

/** Centred single-column page used by sign-in, sign-up, and onboarding. */
function AuthShell({
  heading,
  tagline,
  children,
}: {
  heading: string;
  tagline: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-8">
      <div>
        <h1 className="font-medium text-xl">{heading}</h1>
        <p className="text-muted-foreground text-sm">{tagline}</p>
      </div>
      {children}
    </main>
  );
}

export { AuthShell };
